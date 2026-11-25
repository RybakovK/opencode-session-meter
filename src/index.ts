import { Plugin } from "@opencode/plugin"
import { PLUGIN_ID } from "./plugin/id"

// The GUI and the server entries share the same id.
export default Plugin.define({
  id: PLUGIN_ID,
  setup() {},
})
