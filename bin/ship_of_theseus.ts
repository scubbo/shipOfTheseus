#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { PipelineOfTheseus } from '../lib/ship_of_theseus-stack';

const app = new cdk.App();

// const paramOAuthToken = new cdk.CfnParameter(app, 'paramOAuthToken', {
//     type: 'String',
//     description: 'OAuth Token for GitHub interaction',
//     noEcho: true
// })
// const paramOwner = new cdk.CfnParameter(app, 'paramOwner', {
//     type: 'String',
//     description: 'Owner of the source GitHub repo'
// });
// const paramRepo = new cdk.CfnParameter(app, 'paramRepo', {
//     type: 'String',
//     description: 'Name of the source GitHub repo'
// })
// const paramZoneDomainName = new cdk.CfnParameter(app, 'paramZoneDomainName', {
//     type: 'String',
//     description: 'Domain Name of the Zone for the website'
// })
// const paramRecordName = new cdk.CfnParameter(app, 'paramRecordName', {
//     type: 'String',
//     description: 'The Name that this website will be accessible at (under Hosted Zone). The full address will be https://<name>.<zone>'
// })

new PipelineOfTheseus(app, 'PipelineOfTheseus', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});
