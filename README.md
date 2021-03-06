# Welcome to the Project Of Theseus!

Inspired by danhon@'s email on 2021-03-12 (not linked because a. I think he's currently
migrating from Substack to Buttondown anyway, so the link would probably be dead soon,
and b. updating this will give me a good opportunity to test the push-and-update functionality),
I have created this project that is "_on Github and all it [...] publish[es is] its version history_".

# Installation

## Prerequisites

* You must have the [CDK CLI](https://aws.amazon.com/cdk/) installed.
* You must have your own AWS Account, and own a Route53 Hosted Zone on it.
  * You must have local [AWS credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) 
      that have admin privileges on that account. 
* You must have your own GitHub account.
* You are encouraged to have your own Docker account, otherwise you will
    [be counted as an anonymous user](https://www.docker.com/increase-rate-limits), which severely
    limits your ability to do Docker pulls (I suspect that "all CodeBuild requests" are in the same rate-limiting
    bucket, because I definitely got limited earlier than 100 builds in 6 hours...)

## Step-by-step

* Fork this package to your own GitHub account.
* Check it out locally:
```
$ git clone git@github.com:<yourUsername>/shipOfTheseus.git
```
* Get a new OAuth token for your Github account:
  * Go [here](https://github.com/settings/tokens), and click "Generate New Token"
  * Sign in
  * Give the token whatever name you want, and check "`admin:repo_hook`" and "`repo`". Click "Generate"
  * Copy the resultant token - you can only view it once, and you'll need to paste it in below.
* Bootstrap your AWS Account for CDK Pipeline deployments ([link](https://docs.aws.amazon.com/cdk/api/latest/docs/pipelines-readme.html#cdk-environment-bootstrapping))
    (replace `111111111111` with your accountId):
 ```
$ npm install aws-cdk@latest
$ env CDK_NEW_BOOTSTRAP=1 npx cdk bootstrap \
    --profile <admin-profile> \
    --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
    aws://111111111111/us-east-1
```
This should print `Environment aws://111111111111/us-east-1 bootstrapped.`
* Create [SecretsManager](https://aws.amazon.com/secrets-manager/) Secrets for your OAuth Token
    and your docker Password:
```
$ ./create-secrets.sh -p <admin-profile> -o <OAuthToken> -d <DockerPassword>
```
This will print two ARNs - you will use them in the next step!
* Update the `owner`, `repo`, `recordName`, `zoneDomainName`, `dockerUsername`, `oAuthTokenSecretArn`, and
    `dockerPasswordSecretArn` values in `cdk.json` to appropriate values
    (for instance, for `ship.these.us`, the values would be `recordName=ship` and `zoneDomainName=these.us`)
* One-off deploy:
```
$ cdk deploy --profile <admin-profile> --all
```