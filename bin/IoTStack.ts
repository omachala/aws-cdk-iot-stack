#!/usr/bin/env node
import { App } from "@aws-cdk/core";
import "source-map-support/register";
import { IoTStack } from "../src/IoTStack";

const app = new App();
new IoTStack(app, "IoTStack");
