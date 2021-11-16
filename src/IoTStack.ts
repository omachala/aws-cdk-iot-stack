import { App, GitHubSourceCodeProvider } from "@aws-cdk/aws-amplify";
import { BuildSpec } from "@aws-cdk/aws-codebuild";
import {
  AccountRecovery,
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider
} from "@aws-cdk/aws-cognito";
import { FederatedPrincipal, ManagedPolicy, Role } from "@aws-cdk/aws-iam";
import {
  CfnCertificate,
  CfnPolicy,
  CfnPolicyPrincipalAttachment,
  CfnThing,
  CfnThingPrincipalAttachment
} from "@aws-cdk/aws-iot";
import {
  Construct,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps
} from "@aws-cdk/core";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId
} from "@aws-cdk/custom-resources";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config();

export class IoTStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // IoT thing
    const iotThing = new CfnThing(this, "cdk-ttgo", {
      thingName: "cdk-ttgo",
    });

    const certReq = readFileSync(resolve("cert.pem")).toString();

    // IoT certificate
    const certificate = new CfnCertificate(this, "cdk-ttgo-certificate", {
      status: "ACTIVE",
      certificateMode: "DEFAULT",
      certificateSigningRequest: certReq,
    });

    certificate.addDependsOn(iotThing);

    // Policy for IoT certificate
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

    // Attach policy to IoT thing certificate
    new CfnPolicyPrincipalAttachment(this, "cdk-policy-principal-attachment", {
      policyName: iotPolicy.policyName!,
      principal: certificate.attrArn,
    });

    // Attach thing to IoT thing certificate
    new CfnThingPrincipalAttachment(
      this,
      "cdk-ttgo-thing-principal-attachment",
      {
        thingName: iotThing.thingName!,
        principal: certificate.attrArn,
      }
    );

    // User Pool
    const userPool = new UserPool(this, "cdk-ttgo-user-pool", {
      userPoolName: "cdk-ttgo-user-pool",
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 6,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // User Pool Client
    const userPoolClient = new UserPoolClient(
      this,
      "cdk-ttgo-user-pool-client",
      {
        userPoolClientName: "cdk-ttgo-user-pool-client",
        userPool,
        authFlows: {
          adminUserPassword: true,
          custom: true,
          userSrp: true,
        },
        supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      }
    );

    // Identity Pool
    const identityPool = new CfnIdentityPool(this, "cdk-ttgo-identity-pool", {
      identityPoolName: "cdk-ttgo-identity-pool",
      allowUnauthenticatedIdentities: true,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    const isAnonymousCognitoGroupRole = new Role(this, "anonymous-group-role", {
      description: "Default role for anonymous users",
      assumedBy: new FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AWSIoTDataAccess"),
      ],
    });

    const isUserCognitoGroupRole = new Role(this, "cdk-ttgo-users-group-role", {
      description: "Default role for authenticated users",
      assumedBy: new FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AWSIoTDataAccess"),
      ],
    });

    new CfnIdentityPoolRoleAttachment(
      this,
      "cdk-ttgo-identity-pool-role-attachment",
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: isUserCognitoGroupRole.roleArn,
          unauthenticated: isAnonymousCognitoGroupRole.roleArn,
        },
        roleMappings: {
          mapping: {
            type: "Token",
            ambiguousRoleResolution: "AuthenticatedRole",
            identityProvider: `cognito-idp.${
              Stack.of(this).region
            }.amazonaws.com/${userPool.userPoolId}:${
              userPoolClient.userPoolClientId
            }`,
          },
        },
      }
    );

    // Amplify Frontend app Build Spec
    const buildSpec = BuildSpec.fromObjectToYaml({
      version: 1,
      applications: [
        {
          frontend: {
            phases: {
              preBuild: {
                commands: ["yarn install"],
              },
              build: {
                commands: ["yarn build"],
              },
            },
            artifacts: {
              baseDirectory: "dist",
              files: ["**/*"],
            },
            cache: {
              paths: ["node_modules/**/*"],
            },
          },
        },
      ],
    });

    const getIoTEndpoint = new AwsCustomResource(
      this,
      "cdk-ttgo-iot-endpoint",
      {
        onCreate: {
          service: "Iot",
          action: "describeEndpoint",
          physicalResourceId:
            PhysicalResourceId.fromResponse("endpointAddress"),
          parameters: {
            endpointType: "iot:Data-ATS",
          },
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    const iotThingEndpoint = getIoTEndpoint.getResponseField("endpointAddress");

    // Amplify Frontend app
    const amplifyApp = new App(this, "cdk-ttgo-amplify", {
      appName: "cdk-ttgo-amplify",
      buildSpec,
      environmentVariables: {
        IDENTITY_POOL_ID: identityPool.ref,
        REGION: Stack.of(this).region,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_WEB_CLIENT_ID: userPoolClient.userPoolClientId,
        IOT_THING_ENDPOINT: iotThingEndpoint,
      },
      sourceCodeProvider: new GitHubSourceCodeProvider({
        oauthToken: SecretValue.plainText(process.env.GITHUB_ACCESS_TOKEN!),
        owner: process.env.GITHUB_REPO_USER!,
        repository: process.env.GITHUB_REPO_NAME!,
      }),
    });

    amplifyApp.addBranch("master");
  }
}
