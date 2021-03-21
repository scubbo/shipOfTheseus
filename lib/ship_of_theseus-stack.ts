import * as cdk from '@aws-cdk/core';
import { Distribution } from '@aws-cdk/aws-cloudfront';
import { S3Origin } from '@aws-cdk/aws-cloudfront-origins';
import { GitHubSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import { CustomResource, Stage } from "@aws-cdk/core";
import { Artifact } from "@aws-cdk/aws-codepipeline";
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { ARecord, HostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from "@aws-cdk/aws-s3";
import { BucketDeployment, Source } from "@aws-cdk/aws-s3-deployment";

class ApplicationStage extends Stage {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    // Immediately delegate to a stack because it's an error to create Buckets (and
    // probably other resources) directly in a Stage.
    new ApplicationStack(this, 'ApplicationStack', props);

  }
}

class ApplicationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'WebsiteBucket');
    new BucketDeployment(this, "Deployment", {
      sources: [Source.asset('static-site')],
      destinationBucket: bucket,
    });
    // TODO: update Cache configuration so `commits.json` has lower cache rate
    // to ensure it's updated faster (which is honestly pointless from a practical
    // perspective - but it's the principle of the thing)
    let distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: { origin: new S3Origin(bucket)}
    })
    // const zone = HostedZone.fromLookup(this, 'baseZone', {
    //   domainName: this.node.tryGetContext('zoneDomainName'),
    // })
    let zoneName = this.node.tryGetContext('domainName');
    if (zoneName === undefined) {
      throw new Error("ZoneName is undefined");
    }
    const zone = new HostedZone(this, 'HostedZone', {
      zoneName: zoneName
    })
    new ARecord(this, 'ARecord', {
      zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      recordName: this.node.tryGetContext('recordName')
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

export class PipelineOfTheseus extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const paramOAuthToken = new cdk.CfnParameter(this, 'paramOAuthToken', {
      type: 'String',
      description: 'OAuth Token for GitHub interaction',
      noEcho: true
    })
    const paramOwner = new cdk.CfnParameter(this, 'paramOwner', {
      type: 'String',
      description: 'Owner of the source GitHub repo'
    });
    const paramRepo = new cdk.CfnParameter(this, 'paramRepo', {
      type: 'String',
      description: 'Name of the source GitHub repo'
    })
    const paramZoneDomainName = new cdk.CfnParameter(this, 'paramZoneDomainName', {
      type: 'String',
      description: 'Domain Name of the Zone for the website'
    })
    const paramRecordName = new cdk.CfnParameter(this, 'paramRecordName', {
      type: 'String',
      description: 'The Name that this website will be accessible at (under Hosted Zone). The full address will be https://<name>.<zone>'
    })

    // https://docs.aws.amazon.com/cdk/api/latest/docs/pipelines-readme.html
    const sourceArtifact = new Artifact();
    const cloudAssemblyArtifact = new Artifact();

    const pipeline = new CdkPipeline(this, 'Pipeline', {
      pipelineName: 'PipelineOfTheseus',
      cloudAssemblyArtifact,

      sourceAction: new GitHubSourceAction({
        actionName: 'GitHub',
        output: sourceArtifact,
        branch: 'main',
        oauthToken: new cdk.SecretValue(paramOAuthToken.valueAsString),
        owner: paramOwner.valueAsString,
        repo: paramRepo.valueAsString
      }),

      synthAction: SimpleSynthAction.standardNpmSynth({
        sourceArtifact: sourceArtifact,
        cloudAssemblyArtifact: cloudAssemblyArtifact,
        // Necessary in order to connect to Docker, which itself is necessary for `PythonFunction`
        environment: {privileged: true},
        synthCommand: 'npx cdk synth ' +
            // Yes, you do have to pass these context variable down into the next context - I checked :P
            '-c ghUrl=https://api.github.com/repos/' + paramOwner.valueAsString + '/' + paramRepo.valueAsString + ' ' +
            '-c domainName=' + paramZoneDomainName.valueAsString + ' ' +
            '-c recordName=' + paramRecordName.valueAsString
      }),
      // I don't know why, but, without this, I get `Cannot retrieve value from context provider hosted-zone since
      // account/region are not specified at the stack level.` even though they're set below...
      crossAccountKeys: false
    })

    pipeline.addApplicationStage(new ApplicationStage(this, 'prod-stage', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      }
    }))

  }
}