// Installer steps, in execution order.
import { dependencies } from "./dependencies.mjs";
import { envLocal } from "./env-local.mjs";
import { requirements } from "./requirements.mjs";

/** @type {import("../main.mjs").Step[]} */
export const STEPS = [requirements, dependencies, envLocal];
