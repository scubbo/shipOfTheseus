import * as cdk from '@aws-cdk/core';
import { Artifact, Pipeline } from '@aws-cdk/aws-codepipeline';
import { GitHubSourceAction, S3DeployAction } from '@aws-cdk/aws-codepipeline-actions';
import { Bucket } from '@aws-cdk/aws-s3';

export class ShipOfTheseusStack extends cdk.Stack {
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
    const param_project_id = new cdk.CfnParameter(this, 'param_project_id', {
      type: 'String',
      description: 'Name of this project (used, among other things, to create a globally-unique S3 bucket name)'
    })
    // const oAuthTokenSecret = new CfnSecret(this, 'oAuthToken', {
    //   secretString: param_project_id.valueAsString
    // });

    const targetBucket = new Bucket(this, 'Bucket');


    // https://docs.aws.amazon.com/cdk/api/latest/docs/aws-codepipeline-actions-readme.html
    let artifact = new Artifact();
    let sourceAction = new GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: paramOwner.valueAsString,
      repo: paramRepo.valueAsString,
      oauthToken: new cdk.SecretValue(param_project_id.valueAsString),
      output: artifact
    });

    new Pipeline(this, 'PipelineOfTheseus', {
      stages: [
        {
          stageName: 'Source',
          actions: [
              sourceAction
          ]
        },
        {
          stageName: 'Deploy',
          actions: [
            new S3DeployAction({
              actionName: 'S3Deploy',
              bucket: targetBucket,
              input: artifact
            })
          ]
        }
      ]
    })
  }
}
