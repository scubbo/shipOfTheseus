import * as cdk from '@aws-cdk/core';

import {ApplicationStageStack} from "./application-stage";
import {PipelineStack} from "./pipeline";


export class PipelineOfTheseus extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const env = {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION
    }

    let pipelineStack = new PipelineStack(this, 'PipelineStack', {
      env: env
    })

    pipelineStack.pipeline.addApplicationStage(new ApplicationStageStack(this, 'prod-stage', {
      env: env,
    }))

  }
}