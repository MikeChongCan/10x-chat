import React, { useState, useEffect } from "react"
import type { IntegrationSession } from "./background/integration-session"
import { i18n } from "./lib/i18n"
import { Button } from "./components/ui/button"
import { Switch } from "./components/ui/switch"
import { Check, SpinnerGap } from "@phosphor-icons/react"
import "./style.css"

interface ServiceConfig {
  chatgpt: boolean
  grok: boolean
  gemini: boolean
  perplexity: boolean
  claude: boolean
}

const getServiceDetails = () => ({
  chatgpt: {
    name: i18n("serviceNameChatGPT"),
    description: i18n("serviceDescChatGPT"),
    icon: "◆",
  },
  grok: {
    name: i18n("serviceNameGrok"),
    description: i18n("serviceDescGrok"),
    icon: "𝕏",
  },
  gemini: {
    name: i18n("serviceNameGoogleGemini"),
    description: i18n("serviceDescGemini"),
    icon: "✦",
  },
  perplexity: {
    name: i18n("serviceNamePerplexityAI"),
    description: i18n("serviceDescPerplexity"),
    icon: "◎",
  },
  claude: {
    name: i18n("serviceNameClaude"),
    description: i18n("serviceDescClaude"),
    icon: "◉",
  }
})

function OptionsPage() {
  const [services, setServices] = useState<ServiceConfig>({
    chatgpt: true,
    grok: true,
    gemini: true,
    perplexity: true,
    claude: true
  })
  const [launchMode, setLaunchMode] = useState<"tabGroup" | "windows" | "tabs">("tabGroup")
  const [useTabGroups, setUseTabGroups] = useState(true)
  const [continuousMode, setContinuousMode] = useState(false)
  const [integrationMode, setIntegrationMode] = useState(false)
  const [sessions, setSessions] = useState<IntegrationSession[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")

  useEffect(() => {
    chrome.storage.sync.get(
      ["enabledServices", "launchMode", "useTabGroups", "continuousMode", "integrationMode"],
      (result) => {
        if (result.enabledServices) {
          setServices(result.enabledServices)
        }
        if (result.launchMode) {
          setLaunchMode(result.launchMode)
        }
        if (result.useTabGroups !== undefined) {
          setUseTabGroups(result.useTabGroups)
        }
        if (typeof result.continuousMode === "boolean") {
          setContinuousMode(result.continuousMode)
        }
        if (typeof result.integrationMode === "boolean") {
          setIntegrationMode(result.integrationMode)
        }
      }
    )
  }, [])

  useEffect(() => {
    chrome.storage.local.get(["integrationSessions"], (result) => {
      const stored = result.integrationSessions as IntegrationSession[] | undefined
      if (stored) {
        setSessions(stored)
      }
    })
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.integrationSessions) {
        const next = changes.integrationSessions.newValue as IntegrationSession[] | undefined
        setSessions(next || [])
      }
    }
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener)
    }
    return () => {
      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(listener)
      }
    }
  }, [])

  const handleToggle = (service: keyof ServiceConfig) => {
    setServices((prev) => ({
      ...prev,
      [service]: !prev[service]
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await chrome.storage.sync.set({
        enabledServices: services,
        launchMode: launchMode
      })
      await chrome.storage.sync.set({ useTabGroups: useTabGroups })
      await chrome.storage.sync.set({
        continuousMode: continuousMode,
        integrationMode: integrationMode
      })
      setSaveMessage(i18n("settingsSaved"))
      setTimeout(() => setSaveMessage(""), 3000)
    } catch {
      setSaveMessage(i18n("errorSaving"))
      setTimeout(() => setSaveMessage(""), 3000)
    }
    setIsSaving(false)
  }

  const enabledCount = Object.values(services).filter(Boolean).length
  const serviceDetails = getServiceDetails()
  const latestSession = sessions.length > 0 ? sessions[0] : null
  const latestSummary = latestSession?.summary
  const combinedSummaryText = latestSummary
    ? latestSummary.combined || latestSummary.comparison.flatMap((item) => item.highlights).join(" ")
    : ""
  const lastUpdatedDisplay = latestSession ? new Date(latestSession.updatedAt).toLocaleString() : ""

  const sectionClass = "rounded-lg border border-border bg-card"
  const radioClass = "mt-1 h-3.5 w-3.5 accent-foreground"

  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans">
      <div className="max-w-2xl mx-auto py-10 px-6">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{i18n("optionsTitle")}</h1>
            <p className="text-muted-foreground text-sm mt-1">{i18n("optionsSubtitle")}</p>
          </div>
          <div className="text-right shrink-0 pt-1">
            <div className="text-sm font-medium tabular-nums">{enabledCount}/5</div>
            <div className="text-xs text-muted-foreground">{i18n("enabled")}</div>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="text-sm font-semibold mb-1">{i18n("activeServices")}</h2>
          <p className="text-sm text-muted-foreground mb-3">{i18n("activeServicesDesc")}</p>
          <div className={`${sectionClass} divide-y divide-border`}>
            {(Object.keys(serviceDetails) as Array<keyof ServiceConfig>).map((serviceKey) => {
              const service = serviceDetails[serviceKey]
              const isEnabled = services[serviceKey]

              return (
                <div
                  key={serviceKey}
                  data-service={serviceKey}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 shrink-0 rounded-md border border-border bg-muted flex items-center justify-center text-sm text-foreground">
                      {service.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm">{service.name}</h3>
                      <p className="text-muted-foreground text-xs line-clamp-2">{service.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs ${isEnabled ? "text-foreground" : "text-muted-foreground"}`}>
                      {isEnabled ? i18n("serviceEnabled") : i18n("serviceDisabled")}
                    </span>
                    <Switch
                      checked={isEnabled}
                      aria-label={service.name}
                      onCheckedChange={() => handleToggle(serviceKey)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mb-8">
          <div className={`${sectionClass} divide-y divide-border`}>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex-1">
                <h3 className="font-medium text-sm">{i18n("enableTabGroups")}</h3>
                <p className="text-muted-foreground text-xs mt-0.5">{i18n("enableTabGroupsDesc")}</p>
              </div>
              <Switch checked={useTabGroups} aria-label={i18n("enableTabGroups")} onCheckedChange={setUseTabGroups} />
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex-1">
                <h3 className="font-medium text-sm">{i18n("continuousModeLabel")}</h3>
                <p className="text-muted-foreground text-xs mt-0.5">{i18n("continuousModeDescription")}</p>
              </div>
              <Switch checked={continuousMode} aria-label={i18n("continuousModeLabel")} onCheckedChange={setContinuousMode} />
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex-1">
                <h3 className="font-medium text-sm">{i18n("integrationModeLabel")}</h3>
                <p className="text-muted-foreground text-xs mt-0.5">{i18n("integrationModeDescription")}</p>
              </div>
              <Switch checked={integrationMode} aria-label={i18n("integrationModeLabel")} onCheckedChange={setIntegrationMode} />
            </div>
          </div>
        </section>

        <section
          className={`mb-8 transition-opacity ${
            useTabGroups ? "opacity-100" : "opacity-50 pointer-events-none"
          }`}
        >
          <h2 className="text-sm font-semibold mb-1">{i18n("launchMode")}</h2>
          <p className="text-sm text-muted-foreground mb-3">{i18n("launchModeDesc")}</p>

          <div className={`${sectionClass} divide-y divide-border`}>
            <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
              <input
                type="radio"
                name="launchMode"
                aria-label={i18n("tabGroupMode")}
                value="tabGroup"
                checked={launchMode === "tabGroup"}
                onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}
                className={radioClass}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {i18n("tabGroupMode")}{" "}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{i18n("tabGroupModeDesc")}</p>
              </div>
            </label>

            <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
              <input
                type="radio"
                name="launchMode"
                aria-label={i18n("windowsMode")}
                value="windows"
                checked={launchMode === "windows"}
                onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}
                className={radioClass}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{i18n("windowsMode")}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{i18n("windowsModeDesc")}</p>
              </div>
            </label>

            <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
              <input
                type="radio"
                name="launchMode"
                aria-label={i18n("tabsMode")}
                value="tabs"
                checked={launchMode === "tabs"}
                onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}
                className={radioClass}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{i18n("tabsMode")}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{i18n("tabsModeDesc")}</p>
              </div>
            </label>
          </div>
        </section>

        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold">{i18n("integrationSummaryTitle")}</h2>
            {lastUpdatedDisplay && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums">{lastUpdatedDisplay}</span>
            )}
          </div>
          <div className={`${sectionClass} px-4 py-3`}>
            {latestSession ? (
              <div>
                <p className="text-sm font-medium">"{latestSession.query}"</p>
                {combinedSummaryText && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{combinedSummaryText}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{i18n("integrationSummaryEmpty")}</p>
            )}
          </div>
        </section>

        <div className="flex items-center gap-4 border-t border-border pt-5">
          <Button onClick={handleSave} disabled={isSaving} className="h-9 px-4 text-sm gap-2">
            {isSaving ? (
              <>
                <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                <span>{i18n("saving")}</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" weight="bold" />
                <span>{i18n("saveSettings")}</span>
              </>
            )}
          </Button>

          {saveMessage && (
            <div
              role="status"
              className={`text-sm ${saveMessage.includes("Error") ? "text-destructive" : "text-muted-foreground"}`}
            >
              {saveMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OptionsPage
