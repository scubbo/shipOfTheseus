import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as ShipOfTheseus from '../lib/ship_of_theseus-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new ShipOfTheseus.ShipOfTheseusStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
