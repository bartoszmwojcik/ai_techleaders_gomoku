// Installer steps, in execution order.
import { browser } from "./browser.mjs";
import { database } from "./database.mjs";
import { databaseTarget } from "./database-target.mjs";
import { dependencies } from "./dependencies.mjs";
import { envLocal } from "./env-local.mjs";
import { migrations } from "./migrations.mjs";
import { requirements } from "./requirements.mjs";

/** @type {import("../main.mjs").Step[]} */
export const STEPS = [requirements, dependencies, envLocal, databaseTarget, database, migrations, browser];
