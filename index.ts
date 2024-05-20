require("dotenv").config();

import { Duke } from "./duke";

const duke = new Duke({})
await duke.init()
await duke.login()
await duke.read_api()
await duke.browser.close()