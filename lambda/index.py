import json
import os
import requests

def handler(event, context):
    print(f'DEBUG - called!')
    print(f'{event}')
    print(os.environ)
    print(os.environ['githubCommitsUrl'])
    print(requests.get(os.environ['githubCommitsUrl']).content)
    # TODO - pass in the commit that the pipeline's working on, and restrict this
    # to only "commits prior to that", just in case there are two commits in quick succession
    # TODO - write the data to `commits.json` in the S3 bucket.
