import * as cdk from '@aws-cdk/core';
import {CustomResource, Duration, Stage} from '@aws-cdk/core';
import {DnsValidatedCertificate} from '@aws-cdk/aws-certificatemanager';
import {Distribution, ViewerProtocolPolicy} from '@aws-cdk/aws-cloudfront';
import {S3Origin} from '@aws-cdk/aws-cloudfront-origins';
import {GitHubSourceAction} from '@aws-cdk/aws-codepipeline-actions';
import {Artifact} from "@aws-cdk/aws-codepipeline";
import {Effect, PolicyStatement} from "@aws-cdk/aws-iam";
import {PythonFunction} from "@aws-cdk/aws-lambda-python";
import {CdkPipeline, SimpleSynthAction} from '@aws-cdk/pipelines';
import {ARecord, HostedZone, RecordTarget} from '@aws-cdk/aws-route53';
import {CloudFrontTarget} from '@aws-cdk/aws-route53-targets';
import {Bucket} from "@aws-cdk/aws-s3";
import {BucketDeployment, Source} from "@aws-cdk/aws-s3-deployment";
import {RetentionDays} from "@aws-cdk/aws-logs";
import {BuildEnvironmentVariableType} from "@aws-cdk/aws-codebuild";
import {Secret} from "@aws-cdk/aws-secretsmanager";


class ApplicationStage extends Stage {

  constructor(scope: cdk.Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    // Immediately delegate to a stack, because it's an error to create Buckets
    // (and probably other resources) directly in a Stage.
    new ApplicationStack(this, 'ApplicationStack', props);

  }
}

class ApplicationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    // TODO: Extract this safety-checking
    let zoneId = this.node.tryGetContext('zoneId');
    if (zoneId === undefined) {
      throw new Error("ZoneId is undefined");
    }
    let zoneDomainName = this.node.tryGetContext('zoneDomainName');
    if (zoneDomainName === undefined) {
      throw new Error("ZoneDomainName is undefined");
    }
    let recordName = this.node.tryGetContext('recordName');
    if (recordName === undefined) {
      throw new Error('RecordName is undefined')
    }
    let ghCommitsUrl = 'https://api.github.com/repos/' + this.node.tryGetContext('owner') +
        '/' + this.node.tryGetContext('repo') + '/commits/HEAD'
    // I would have loved to do this as `domainNames: [aRecord.domainName]`, but
    // boo hoo that would cause a circular dependency wah wah.
    let fullDomainName = recordName + '.' + zoneDomainName

    const bucket = new Bucket(this, 'WebsiteBucket');
    // When I tried doing lookup-by-domain-name, Cloudformation created another Host Zone with the _same name_?
    // I got `fromAttributes` from [here](https://github.com/aws/aws-cdk/issues/3663)
    const zone = HostedZone.fromHostedZoneAttributes(this, 'baseZone', {
      zoneName: zoneDomainName,
      hostedZoneId: zoneId
    })
    const certificate = new DnsValidatedCertificate(this, 'mySiteCert', {
      domainName: fullDomainName,
      hostedZone: zone,
    });
    let distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new S3Origin(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: 'index.html',
      domainNames: [fullDomainName],
      certificate: certificate,
    })
    new BucketDeployment(this, "Deployment", {
      sources: [Source.asset('static-site')],
      destinationBucket: bucket,
      distribution: distribution
    });

    new ARecord(this, 'ARecord', {
      zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      recordName: recordName
    })

    const lambda = new PythonFunction(this, 'FetchCommitHistoryFunction', {
      entry: 'lambda/',
      environment: {
        bucketArn: bucket.bucketArn,
        distributionId: distribution.distributionId,
        githubCommitsUrl: ghCommitsUrl
      },
      logRetention: RetentionDays.ONE_WEEK,
      timeout: Duration.minutes(1)
    });
    // I expected that `grantPut` should be sufficient here - but, with that, the boto call completes without any
    // error, but the file doesn't show up. Curious
    bucket.grantWrite(lambda);
    lambda.role?.addToPolicy(new PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      effect: Effect.ALLOW,
      resources: ['*']
    }))
    new CustomResource(this, 'FetchCommitsCustomResource', {
      serviceToken: lambda.functionArn,
      properties: {
        // Without this, the CustomResource wouldn't have any "updates", and so wouldn't get called on re-deploys
        timestamp: Date.now().toString()
      }
    });

  }
}

// Inner Stack to allow Parameters to be used in the pipeline and in the ApplicationStack
// without causing dependency issues
class InnerPipelineStack extends cdk.Stack {

  readonly pipeline: CdkPipeline

  constructor(scope: cdk.Construct, id: string, props: cdk.StageProps) {
    super(scope, id, props);

    // https://docs.aws.amazon.com/cdk/api/latest/docs/pipelines-readme.html
    const sourceArtifact = new Artifact();
    const cloudAssemblyArtifact = new Artifact();

    let dockerPasswordSecretArn = this.node.tryGetContext('dockerPasswordSecretArn');
    if (dockerPasswordSecretArn === undefined) {
      throw new Error("dockerPasswordSecretArn is undefined");
    }
    let dockerPasswordSecretName = Secret.fromSecretCompleteArn(
        this, 'dockerPasswordSecret', dockerPasswordSecretArn
    ).secretName;


    this.pipeline = new CdkPipeline(this, 'Pipeline', {
      pipelineName: 'PipelineOfTheseus',
      cloudAssemblyArtifact,

      sourceAction: new GitHubSourceAction({
        actionName: 'GitHub',
        output: sourceArtifact,
        branch: 'main',
        oauthToken: cdk.SecretValue.secretsManager(this.node.tryGetContext("oAuthTokenSecretArn")),
        owner: this.node.tryGetContext('owner'),
        repo: this.node.tryGetContext('repo')
      }),

      synthAction: SimpleSynthAction.standardNpmSynth({
        sourceArtifact: sourceArtifact,
        cloudAssemblyArtifact: cloudAssemblyArtifact,
        environment: {
          environmentVariables: {
            'dockerUsername': {
              type: BuildEnvironmentVariableType.PLAINTEXT,
              value: this.node.tryGetContext("dockerUsername")
            },
            'dockerPassword': {
              type: BuildEnvironmentVariableType.SECRETS_MANAGER,
              value: dockerPasswordSecretName
            }
          },
          // Necessary in order to connect to Docker, which itself is necessary for `PythonFunction`
          privileged: true,
        },
        // `npm ci` is the default - we also log in to Docker because of
        // https://www.docker.com/increase-rate-limits and https://bit.ly/3sEcPC4
        installCommand: 'npm ci && echo "Logging in to Docker..." && echo "DEBUG: $dockerUsername" && echo "DEBUG: $dockerPassword" |  tr "[:lower:]" "[:upper:]" && echo $dockerPassword | docker login -u $dockerUsername --password-stdin',
        rolePolicyStatements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              // These actions are more than I expected, but experimenting with IAM is a real arse, so I'm just copying
              // https://github.com/aws/aws-cdk/issues/8752#issuecomment-698276397
              actions: [
                'secretsmanager:GetRandomPassword',
                'secretsmanager:GetResourcePolicy',
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
                'secretsmanager:ListSecretVersionIds',
              ],
              resources: [dockerPasswordSecretArn]
            })
        ]
      }),
      // I don't know why, but, without this, I get `Cannot retrieve value from context provider hosted-zone since
      // account/region are not specified at the stack level.` even though they're set below...
      crossAccountKeys: false
    })
  }
}


export class PipelineOfTheseus extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const env = {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    }

    let innerPipelineStack = new InnerPipelineStack(this, 'InnerPipelineStack', {
      env: env
    })

    innerPipelineStack.pipeline.addApplicationStage(new ApplicationStage(this, 'prod-stage', {
      env: env,
    }))

  }
}