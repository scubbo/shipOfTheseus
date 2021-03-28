import * as cdk from "@aws-cdk/core";
import {CdkPipeline, SimpleSynthAction} from "@aws-cdk/pipelines";
import {Artifact} from "@aws-cdk/aws-codepipeline";
import {Secret} from "@aws-cdk/aws-secretsmanager";
import {GitHubSourceAction} from "@aws-cdk/aws-codepipeline-actions";
import {BuildEnvironmentVariableType} from "@aws-cdk/aws-codebuild";
import {Effect, PolicyStatement} from "@aws-cdk/aws-iam";

export class PipelineStack extends cdk.Stack {

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
                installCommand: 'npm ci && echo "Logging in to Docker..." && echo $dockerPassword | docker login -u $dockerUsername --password-stdin',
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
