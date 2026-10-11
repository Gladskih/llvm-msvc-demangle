import { createDemangler } from "../dist/browser.js";

const api = await createDemangler();
self.onmessage = event => self.postMessage(api.demangleType(event.data));
self.postMessage("ready");
