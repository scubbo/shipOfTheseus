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
* One-off deploy:
```
$ cdk deploy --profile <admin-profile> \
    --parameters paramOAuthToken=<your Github OAuth token, from earlier> \
    -c owner=<your Github username> \
    -c repo=<your Github repo name> \
    -c zoneDomainName=<hosted zone>
    -c recordName=<name within hosted zone to deploy to>
```