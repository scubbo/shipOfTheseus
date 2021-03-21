import json
import os
import requests

import logging
logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)


def handler(event, context):
    try:
        log.info(f'DEBUG - called!')
        log.info(f'{event}')
        if event['RequestType'] in ['Create', 'Update']:
            log.info(os.environ)
            log.info(os.environ['githubCommitsUrl'])
            log.info(requests.get(os.environ['githubCommitsUrl']).content)
            # TODO - pass in the commit that the pipeline's working on, and restrict this
            # to only "commits prior to that", just in case there are two commits in quick succession
            # TODO - write the data to `commits.json` in the S3 bucket.
        else:
            log.info('Non-create/update RequestType')
        requests.put(event['ResponseURL'], data=dict(
            {'Status': 'SUCCESS'},
            **{key: event[key] for key in
               ['PhysicalResourceId', 'StackId', 'RequestId', 'LogicalResourceId']}
        ))
    except Exception as e:
        log.error(f'Lambda failed! {e}')
        requests.put(event['ResponseURL'], data=dict(
            {'Status': 'FAILED'},
            **{key: event[key] for key in
               ['PhysicalResourceId', 'StackId', 'RequestId', 'LogicalResourceId']}
        ))
