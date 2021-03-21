import * as cdk from '@aws-cdk/core';
import { DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import { Distribution } from '@aws-cdk/aws-cloudfront';
import { S3Origin } from '@aws-cdk/aws-cloudfront-origins';
import { GitHubSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import {CfnParameter, CustomResource, Stage} from "@aws-cdk/core";
import { Artifact } from "@aws-cdk/aws-codepipeline";
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { ARecord, HostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from "@aws-cdk/aws-s3";
import { BucketDeployment, Source } from "@aws-cdk/aws-s3-deployment";


interface ApplicationStageProps extends cdk.StageProps {
  // recordName: string,
  // zoneDomainName: string
}
class ApplicationStage extends Stage {

  constructor(scope: cdk.Construct, id: string, props: ApplicationStageProps) {
    super(scope, id, props);

    // Immediately delegate to a stack because it's an error to create Buckets (and
    // probably other resources) directly in a Stage.
    new ApplicationStack(this, 'ApplicationStack', props);

  }
}

interface ApplicationStackProps extends ApplicationStageProps {}
class ApplicationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: ApplicationStageProps) {
    super(scope, id, props);

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
    // I would have loved to do this as `domainNames: [aRecord.domainName]`, but
    // boo hoo that would cause a circular dependency wah wah.
    let fullDomainName = recordName + '.' + zoneDomainName

    const bucket = new Bucket(this, 'WebsiteBucket');
    new BucketDeployment(this, "Deployment", {
      sources: [Source.asset('static-site')],
      destinationBucket: bucket,
    });
    // TODO: When I tried doing lookup-by-domain-name, Cloudformation created another Host Zone with the _same name_?
    // I got `fromAttributes` from [here](https://github.com/aws/aws-cdk/issues/3663)
    const zone = HostedZone.fromHostedZoneAttributes(this, 'baseZone', {
      zoneName: zoneDomainName,
      hostedZoneId: zoneId
    })
    const certificate = new DnsValidatedCertificate(this, 'mySiteCert', {
      domainName: fullDomainName,
      hostedZone: zone,
    });
    // TODO: update Cache configuration so `commits.json` has lower cache rate
    // to ensure it's updated faster (which is honestly pointless from a practical
    // perspective - but it's the principle of the thing)
    let distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: { origin: new S3Origin(bucket)},
      domainNames: [fullDomainName],
      certificate: certificate
    })

    // const zone = HostedZone.fromHostedZoneId(this, 'baseZone', zoneId)
    // const zone = HostedZone.fromLookup(this, 'baseZone', {
    //     domainName: zoneName,
    //   })
    new ARecord(this, 'ARecord', {
      zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      recordName: recordName
    })
    //
    //
    // const lambda = new PythonFunction(this, 'FetchCommitHistoryFunction', {
    //   entry: 'lambda/',
    //   environment: {
    //     bucketArn: bucket.bucketArn,
    //     githubCommitsUrl: this.node.tryGetContext('ghUrl')
    //   }
    // });
    // bucket.grantPut(lambda);
    // new CustomResource(this, 'FetchCommitsCustomResource', {
    //   serviceToken: lambda.functionArn
    // });
  }
}

interface InnerPipelineStackProps extends cdk.StackProps {
  paramOAuthToken: CfnParameter,
  // owner: string,
  // repo: string,
  // zoneDomainName: string,
  // recordName: string
}
// Inner Stack to allow Parameters to be used in the pipeline and in the ApplicationStack
// without causing dependency issues
class InnerPipelineStack extends cdk.Stack {

  readonly pipeline: CdkPipeline

  constructor(scope: cdk.Construct, id: string, props: InnerPipelineStackProps) {
    super(scope, id, props);

    // We don't actually use this param, but when doing `cdk deploy --parameters <...> --all`, all stacks need to be able to accept all parameters - and we can't just deploy once at once. So all Stacks need to have the same named param
    new CfnParameter(this, 'paramOAuthToken', {
      description: 'Fake param. See comment.',
      noEcho: true
    })

    // https://docs.aws.amazon.com/cdk/api/latest/docs/pipelines-readme.html
    const sourceArtifact = new Artifact();
    const cloudAssemblyArtifact = new Artifact();

    this.pipeline = new CdkPipeline(this, 'Pipeline', {
      pipelineName: 'PipelineOfTheseus',
      cloudAssemblyArtifact,

      sourceAction: new GitHubSourceAction({
        actionName: 'GitHub',
        output: sourceArtifact,
        branch: 'main',
        oauthToken: new cdk.SecretValue(props.paramOAuthToken.valueAsString),
        owner: this.node.tryGetContext('owner'),
        repo: this.node.tryGetContext('repo')
      }),

      synthAction: SimpleSynthAction.standardNpmSynth({
        sourceArtifact: sourceArtifact,
        cloudAssemblyArtifact: cloudAssemblyArtifact,
        // Necessary in order to connect to Docker, which itself is necessary for `PythonFunction`
        environment: {privileged: true},
      //   synthCommand: 'npx cdk synth ' +
      //       // Yes, you do have to pass these context variable down into the next context - I checked :P
      //       '-c ghUrl=https://api.github.com/repos/' + props.owner + '/' + props.repo + ' ' +
      //       '-c domainName=' + props.zoneDomainName + ' ' +
      //       '-c recordName=' + props.recordName
      }),
      // I don't know why, but, without this, I get `Cannot retrieve value from context provider hosted-zone since
      // account/region are not specified at the stack level.` even though they're set below...
      crossAccountKeys: false
    })
  }
}


// We can't just define the CfnParameters in the Pipeline Stack because then passing them down to
// the applicationStack gives:
// ```
// You cannot add a dependency from 'PipelineOfTheseus/prod-stage/ApplicationStack'
// (in Stage 'PipelineOfTheseus/prod-stage') to 'PipelineOfTheseus' (in the App):
// dependency cannot cross stage boundaries
// ```
// interface PipelineOfTheseusProps extends cdk.StackProps {
//   oauthToken: string,
//   owner: string,
//   repo: string,
//   zoneDomainName: string,
//   recordName: string
// }
export class PipelineOfTheseus extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const paramOAuthToken = new cdk.CfnParameter(this, 'paramOAuthToken', {
      type: 'String',
      description: 'OAuth Token for GitHub interaction',
      noEcho: true
    })

    let innerPipelineStack = new InnerPipelineStack(this, 'InnerPipelineStack', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      },
      paramOAuthToken: paramOAuthToken
      // recordName: recordName,
      // zoneDomainName: this.node.tryGetContext('zoneDomainName'),
      // repo: this.node.tryGetContext('repo'),
      // oauthToken: props.oauthToken,
      // owner: props.owner
    })




    innerPipelineStack.pipeline.addApplicationStage(new ApplicationStage(this, 'prod-stage', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      },
    }))

  }
}