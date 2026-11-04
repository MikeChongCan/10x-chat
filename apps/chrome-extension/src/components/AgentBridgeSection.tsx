import React, { useCallback, useEffect, useState } from "react"
import { AGENT_BRIDGE_START, BRIDGE_ORIGINS, BRIDGE_PERMISSIONS } from "../background/agent-bridge"
import { i18n } from "../lib/i18n"
import { Button } from "./ui/button"

const bridgePermissions: chrome.permissions.Permissions = {
  permissions: BRIDGE_PERMISSIONS as chrome.runtime.ManifestPermissions[],
  origins: BRIDGE_ORIGINS
}

const startBridge = async () => {
  try {
    await chrome.runtime.sendMessage({ type: AGENT_BRIDGE_START })
  } catch {
    // The background may be asleep or the bridge off; start() runs again on the next event.
  }
}

type Props = {
  sectionClass: string
}

export function AgentBridgeSection({ sectionClass }: Props) {
  const [granted, setGranted] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    try {
      setGranted(await chrome.permissions.contains(bridgePermissions))
    } catch {
      setGranted(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void startBridge()
  }, [refresh])

  const enable = async () => {
    setError("")
    try {
      if (await chrome.permissions.request(bridgePermissions)) await startBridge()
    } catch {
      setError(i18n("agentBridgeError"))
    }
    await refresh()
  }

  const disable = async () => {
    setError("")
    try {
      await chrome.permissions.remove(bridgePermissions)
    } catch {
      setError(i18n("agentBridgeError"))
    }
    await refresh()
  }

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold">{i18n("agentBridgeTitle")}</h2>
        <span role="status" className="text-xs text-muted-foreground">
          {granted ? i18n("agentBridgeOn") : i18n("agentBridgeOff")}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{i18n("agentBridgeDesc")}</p>
      <div className={`${sectionClass} px-4 py-3`}>
        <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
          <li>
            {i18n("agentBridgeStepInstall")}{" "}
            <code className="font-mono text-foreground">skills/10x-chat/bridge/install.sh</code>
          </li>
          <li>{i18n("agentBridgeStepEnable")}</li>
          <li>{i18n("agentBridgeStepUserScripts")}</li>
        </ol>
        <div className="flex items-center gap-3 mt-3">
          {granted ? (
            <Button variant="outline" onClick={disable} className="h-8 px-3 text-sm">
              {i18n("agentBridgeDisable")}
            </Button>
          ) : (
            <Button onClick={enable} className="h-8 px-3 text-sm">
              {i18n("agentBridgeEnable")}
            </Button>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>
    </section>
  )
}
