import {
  CfnCertificate,
  CfnPolicy,
  CfnPolicyPrincipalAttachment,
  CfnThing,
  CfnThingPrincipalAttachment,
} from "@aws-cdk/aws-iot";
import { Construct, Stack, StackProps } from "@aws-cdk/core";
import { readFileSync } from "fs";
import { resolve } from "path";

export class IoTStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const iotThing = new CfnThing(this, "cdk-ttgo", {
      thingName: "cdk-ttgo",
    });

    const certReq = readFileSync(resolve("cert.pem")).toString();

    const certificate = new CfnCertificate(this, "cdk-ttgo-certificate", {
      status: "ACTIVE",
      certificateMode: "DEFAULT",
      certificateSigningRequest: certReq,
    });

    certificate.addDependsOn(iotThing);

    const iotPolicy = new CfnPolicy(this, "cdk-ttgo-policy", {
      policyName: "cdk-ttgo-policy",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["iot:*"],
            Resource: ["*"],
          },
        ],
      },
    });

    iotPolicy.addDependsOn(iotThing);

    new CfnPolicyPrincipalAttachment(this, "cdk-policy-principal-attachment", {
      policyName: iotPolicy.policyName!,
      principal: certificate.attrArn,
    });

    new CfnThingPrincipalAttachment(
      this,
      "cdk-ttgo-thing-principal-attachment",
      {
        thingName: iotThing.thingName!,
        principal: certificate.attrArn,
      }
    );
  }
}
