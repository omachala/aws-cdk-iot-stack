# AWS CDK IOT Stack

Internet of Thing AWS stack.
I've created this Stack to create MQTT connection for my TTGO T-Display ESP32 device I absolutely love ❤️

## Get Started

1. Install `yarn`
2. Review the code and update the `CfnPolicy` policy (`src/IoTStack.ts`)
3. Build the project `yarn build`
4. Generate certificate `yarn generate:certificate`
5. Deploy the stack: `yarn cdk deploy` (or pass your aws profile like `yarn cdk deploy --profile home`)

Note: to delete the stack you may need to detach Certificate and Thing first via AWS web console:

1. IOT Core > Secure > Certificates > Policies > Detach
2. IOT Core > Secure > Certificates > Things > Detach

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Note

After deploy you can check the Amplify Environment Variables (via AWS web console). These can be used to connect your frontend app and so consume MQTT via websockets.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template -->
