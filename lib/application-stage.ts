import * as cdk from "@aws-cdk/core";
import {Bucket} from "@aws-cdk/aws-s3";
import {ARecord, HostedZone, RecordTarget} from "@aws-cdk/aws-route53";
import {DnsValidatedCertificate} from "@aws-cdk/aws-certificatemanager";
import {Distribution, ViewerProtocolPolicy} from "@aws-cdk/aws-cloudfront";
import {S3Origin} from "@aws-cdk/aws-cloudfront-origins";
import {BucketDeployment, Source} from "@aws-cdk/aws-s3-deployment";
import {CloudFrontTarget} from "@aws-cdk/aws-route53-targets";
import {PythonFunction} from "@aws-cdk/aws-lambda-python";
import {RetentionDays} from "@aws-cdk/aws-logs";
import {Construct, CustomResource, Duration, Stage} from "@aws-cdk/core";
import {Effect, PolicyStatement} from "@aws-cdk/aws-iam";

export class ApplicationStageStack extends Stage {
    constructor(scope: cdk.Construct, id: string, props: cdk.StageProps) {
        super(scope, id, props);

        // Immediately delegate to a stack, because it's an error to create Buckets
        // (and probably other resources) directly in a Stage.
        new ApplicationStageInnerStack(this, 'ApplicationStack', props);

    }
}

class ApplicationStageInnerStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: cdk.StageProps) {
        super(scope, id, props);


        let contextVariables = extractAndValidateContextVariables(this);
        const bucket = new Bucket(this, 'WebsiteBucket');
        // When I tried doing lookup-by-domain-name, Cloudformation created another Host Zone with the _same name_?
        // I got `fromAttributes` from [here](https://github.com/aws/aws-cdk/issues/3663)
        const zone = HostedZone.fromHostedZoneAttributes(this, 'baseZone', {
            zoneName: contextVariables.zoneDomainName,
            hostedZoneId: contextVariables.zoneId
        })
        const certificate = new DnsValidatedCertificate(this, 'mySiteCert', {
            domainName: contextVariables.fullDomainName,
            hostedZone: zone,
        });
        let distribution = new Distribution(this, 'Distribution', {
            defaultBehavior: {
                origin: new S3Origin(bucket),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
            },
            defaultRootObject: 'index.html',
            domainNames: [contextVariables.fullDomainName],
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
            recordName: contextVariables.recordName
        })

        const lambda = new PythonFunction(this, 'FetchCommitHistoryFunction', {
            entry: 'lambda/',
            environment: {
                bucketArn: bucket.bucketArn,
                distributionId: distribution.distributionId,
                githubCommitsUrl: contextVariables.ghCommitsUrl
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

interface VariablesFromContext {
    zoneId: string,
    zoneDomainName: string,
    recordName: string,
    ghCommitsUrl: string
    fullDomainName: string
}
function extractAndValidateContextVariables(scope: Construct): VariablesFromContext {
    // TODO: Extract this safety-checking
    let zoneId = scope.node.tryGetContext('zoneId');
    if (zoneId === undefined) {
        throw new Error("ZoneId is undefined");
    }
    let zoneDomainName = scope.node.tryGetContext('zoneDomainName');
    if (zoneDomainName === undefined) {
        throw new Error("ZoneDomainName is undefined");
    }
    let recordName = scope.node.tryGetContext('recordName');
    if (recordName === undefined) {
        throw new Error('RecordName is undefined')
    }
    let ghCommitsUrl = 'https://api.github.com/repos/' + scope.node.tryGetContext('owner') +
        '/' + scope.node.tryGetContext('repo') + '/commits/HEAD'
    // I would have loved to do this directly as `domainNames: [aRecord.domainName]`, but
    // boo hoo that would cause a circular dependency wah wah.
    let fullDomainName = recordName + '.' + zoneDomainName

    return {
        zoneId: zoneId,
        zoneDomainName: zoneDomainName,
        recordName: recordName,
        ghCommitsUrl: ghCommitsUrl,
        fullDomainName: fullDomainName
    }
}