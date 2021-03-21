import * as cdk from '@aws-cdk/core';
import { CdkPipeline, SimpleSynthAction } from '@aws-cdk/pipelines';
import { GitHubSourceAction } from '@aws-cdk/aws-codepipeline-actions';
import {CustomResource, Stage} from "@aws-cdk/core";
import { Artifact } from "@aws-cdk/aws-codepipeline";
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import { Bucket } from "@aws-cdk/aws-s3";
import { BucketDeployment, Source } from "@aws-cdk/aws-s3-deployment";

class ApplicationStage extends Stage {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    // Immediately delegate to a stack because it's an error to create Buckets (and
    // probably other resources) directly in a Stage.
    new ApplicationStack(this, 'ApplicationStack');

  }
}

class ApplicationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'WebsiteBucket', {
      publicReadAccess: true
    });
    new BucketDeployment(this, "Deployment", {
      sources: [Source.asset('static-site')],
      destinationBucket: bucket,
    });
    const lambda = new PythonFunction(this, 'FetchCommitHistoryFunction', {
      entry: 'lambda/',
      environment: {
        bucketArn: bucket.bucketArn,
        githubCommitsUrl: this.node.tryGetContext('ghUrl')
      }
    });
    bucket.grantPut(lambda);
    new CustomResource(this, 'FetchCommitsCustomResource', {
      serviceToken: lambda.functionArn
    });
  }
}

export class PipelineOfTheseus extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const paramOwner = new cdk.CfnParameter(this, 'paramOwner', {
      type: 'String',
      description: 'Owner of the source GitHub repo'
    });
    const paramRepo = new cdk.CfnParameter(this, 'paramRepo', {
      type: 'String',
      description: 'Name of the source GitHub repo'
    })
    const paramOAuthToken = new cdk.CfnParameter(this, 'paramOAuthToken', {
      type: 'String',
      description: 'OAuth Token for GitHub interaction'
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
        repo: paramRepo.valueAsString,
      }),

      synthAction: SimpleSynthAction.standardNpmSynth({
        sourceArtifact: sourceArtifact,
        cloudAssemblyArtifact: cloudAssemblyArtifact,
        // Necessary in order to connect to Docker, which itself is necessary for `PythonFunction`
        environment: {privileged: true},
        synthCommand: 'npx cdk synth -c ghUrl=https://api.github.com/repos/' + paramOwner.valueAsString + '/' + paramRepo.valueAsString
      })
    })

    pipeline.addApplicationStage(new ApplicationStage(this, 'prod-stage'))

  }
}