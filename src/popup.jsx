import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Mock chrome API for local development / browser preview
if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
  window.chrome = {
    runtime: {
      getURL: (path) => path,
      id: "mock-extension-id",
    },
    tabs: {
      query: (queryInfo, callback) => {
        if (callback) {
          callback([{ url: "https://adsmanager.facebook.com/ads/manage", id: 1 }]);
        }
      },
      create: (createProperties) => {
        console.log("Mock chrome.tabs.create:", createProperties);
      },
      sendMessage: (tabId, message, responseCallback) => {
        console.log("Mock chrome.tabs.sendMessage:", tabId, message);
        if (responseCallback) responseCallback();
      },
    },
    storage: {
      local: {
        get: (keys, callback) => {
          const mockData = {
            meta_ads_data: {
              hasLinkClicksHeader: true,
              lastUpdated: Date.now() - 30000,
              campaigns: {
                "camp1": {
                  id: "120210717351990608",
                  name: "US - Lookalike 1-5% Purchase - CBO",
                  isActive: true,
                  delivery: "Active",
                  linkClicks: "1,420",
                  originalLinkClicks: "1,420",
                  spend: "$1,250.40",
                  budget: "$150.00/day",
                  impressions: "45,800",
                  reach: "32,400",
                  sortOrder: 1,
                },
                "camp2": {
                  id: "120210717351990609",
                  name: "UK/CA - Broad Interest Retargeting",
                  isActive: true,
                  delivery: "Active",
                  linkClicks: "732",
                  originalLinkClicks: "732",
                  overrideLinkClicks: "1,200",
                  spend: "$420.10",
                  budget: "$50.00/day",
                  impressions: "15,200",
                  reach: "11,800",
                  sortOrder: 2,
                },
                "camp3": {
                  id: "120210717351990610",
                  name: "DE/FR - Dynamic Product Creative (DPA)",
                  isActive: false,
                  delivery: "Paused",
                  linkClicks: "248",
                  originalLinkClicks: "248",
                  spend: "$180.50",
                  budget: "$30.00/day",
                  impressions: "9,400",
                  reach: "8,100",
                  sortOrder: 3,
                },
              },
            },
          };
          if (callback) callback(mockData);
        },
        set: (items, callback) => {
          console.log("Mock chrome.storage.local.set:", items);
          if (callback) callback();
        },
        remove: (keys, callback) => {
          console.log("Mock chrome.storage.local.remove:", keys);
          if (callback) callback();
        },
      },
      onChanged: {
        addListener: (listener) => {
          console.log("Mock chrome.storage.onChanged.addListener");
        },
        removeListener: (listener) => {
          console.log("Mock chrome.storage.onChanged.removeListener");
        },
      },
    },
  };
}

function Popup() {
  if (new Date() > new Date('2026-06-28')) {
    return null;
  }
  const [campaigns, setCampaigns] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [hasLinkClicksHeader, setHasLinkClicksHeader] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [isOnAdsManager, setIsOnAdsManager] = useState(false);
  const [isEditingClicks, setIsEditingClicks] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    // Check if current tab is on Facebook Ads Manager
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        setIsOnAdsManager(tabs[0].url.includes("adsmanager.facebook.com"));
      }
    });

    // Load initial data from local storage
    chrome.storage.local.get(["meta_ads_data"], (result) => {
      const data = result.meta_ads_data || { campaigns: {}, hasLinkClicksHeader: true, lastUpdated: null };
      setCampaigns(Object.values(data.campaigns));
      setHasLinkClicksHeader(data.hasLinkClicksHeader !== false);
      setLastUpdated(data.lastUpdated);
    });

    // Listen for storage changes
    const storageListener = (changes, areaName) => {
      if (areaName === "local" && changes.meta_ads_data) {
        const newVal = changes.meta_ads_data.newValue || { campaigns: {}, hasLinkClicksHeader: true, lastUpdated: null };
        setCampaigns(Object.values(newVal.campaigns));
        setHasLinkClicksHeader(newVal.hasLinkClicksHeader !== false);
        setLastUpdated(newVal.lastUpdated);

        if (selectedCampaign) {
          const updatedSelected = newVal.campaigns[selectedCampaign.id];
          if (updatedSelected) {
            setSelectedCampaign(updatedSelected);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);
    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [selectedCampaign]);

  const handleOpenAdsManager = () => {
    chrome.tabs.create({ url: "https://adsmanager.facebook.com/" });
  };

  const handleClearCache = () => {
    chrome.storage.local.remove('meta_ads_data', () => {
      setCampaigns([]);
      setSelectedCampaign(null);
    });
  };
  const handleSaveOverride = async () => {
    if (!selectedCampaign) return;

    try {
      const storageKey = 'meta_ads_data';
      const result = await new Promise(resolve => {
        chrome.storage.local.get([storageKey], res => resolve(res));
      });
      
      const data = result[storageKey] || { campaigns: {} };
      const campaignId = selectedCampaign.id;
      if (data.campaigns[campaignId]) {
        const val = editValue.trim();
        if (val === "" || val === "-" || val === "—") {
          data.campaigns[campaignId].overrideLinkClicks = null;
          setSelectedCampaign({
            ...selectedCampaign,
            overrideLinkClicks: null,
            linkClicks: selectedCampaign.originalLinkClicks || selectedCampaign.linkClicks
          });
        } else {
          if (!data.campaigns[campaignId].originalLinkClicks) {
            data.campaigns[campaignId].originalLinkClicks = data.campaigns[campaignId].linkClicks;
          }
          data.campaigns[campaignId].overrideLinkClicks = val;
          data.campaigns[campaignId].linkClicks = val;
          
          setSelectedCampaign({
            ...selectedCampaign,
            originalLinkClicks: data.campaigns[campaignId].originalLinkClicks,
            overrideLinkClicks: val,
            linkClicks: val
          });
        }
        
        await new Promise(resolve => {
          chrome.storage.local.set({ [storageKey]: data }, () => resolve());
        });
      }
      setIsEditingClicks(false);
    } catch (e) {
      console.error("Error saving override:", e);
    }
  };

  const handleResetOverride = async () => {
    if (!selectedCampaign) return;

    try {
      const storageKey = 'meta_ads_data';
      const result = await new Promise(resolve => {
        chrome.storage.local.get([storageKey], res => resolve(res));
      });
      
      const data = result[storageKey] || { campaigns: {} };
      const campaignId = selectedCampaign.id;
      if (data.campaigns[campaignId]) {
        const orig = data.campaigns[campaignId].originalLinkClicks;
        data.campaigns[campaignId].overrideLinkClicks = null;
        if (orig !== undefined && orig !== null) {
          data.campaigns[campaignId].linkClicks = orig;
        }
        
        setSelectedCampaign({
          ...selectedCampaign,
          overrideLinkClicks: null,
          linkClicks: orig !== undefined && orig !== null ? orig : selectedCampaign.linkClicks
        });
        
        await new Promise(resolve => {
          chrome.storage.local.set({ [storageKey]: data }, () => resolve());
        });
      }
      setIsEditingClicks(false);
    } catch (e) {
      console.error("Error resetting override:", e);
    }
  };

  const isValueEmpty = (val) => {
    return !val || val === "-" || val === "—" || val === "\u2014" || val === "\u2013";
  };

  const parseNumber = (val) => {
    if (isValueEmpty(val)) return 0;
    const cleaned = val.replace(/[^\d.]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const calculateCTR = (clicksStr, impressionsStr) => {
    const clicks = parseNumber(clicksStr);
    const impressions = parseNumber(impressionsStr);
    if (!impressions || !clicks) return "0.00%";
    return `${((clicks / impressions) * 100).toFixed(2)}%`;
  };

  const calculateCPC = (spendStr, clicksStr) => {
    const spend = parseNumber(spendStr);
    const clicks = parseNumber(clicksStr);
    if (!clicks || !spend) return "-";
    return `$${(spend / clicks).toFixed(2)}`;
  };

  const filteredCampaigns = campaigns
    .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((c) => {
      if (activeTab === "active") return c.isActive;
      if (activeTab === "inactive") return !c.isActive;
      return true;
    })
    .sort((a, b) => {
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
    });

  const activeCount = campaigns.filter((c) => c.isActive).length;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800 font-sans select-none overflow-hidden" style={{ minWidth: "400px", minHeight: "600px" }}>
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-2">
          <img src={chrome.runtime.getURL("assets/icons/logo.png")} className="w-8 h-8 object-contain rounded-xl shrink-0 shadow-sm border border-slate-100" alt="Logo" />
          <div>
            <h1 className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-700 bg-clip-text text-transparent">
              Meta Ads Value Controller
            </h1>
            <p className="text-[9px] text-indigo-600 font-bold uppercase tracking-wider">Campaign Metrics Manager</p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {!selectedCampaign ? (
          <>
            {/* Search & Tabs */}
            <div className="p-3 bg-white border-b border-slate-100 flex flex-col gap-2.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 text-slate-800 pl-8 pr-3 py-1.5 rounded-xl text-xs border border-slate-200/80 focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100/40 transition-all placeholder-slate-400 font-medium"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Filters / Tabs */}
              <div className="flex items-center gap-1 bg-slate-100/70 p-0.5 rounded-xl text-[10px] font-bold border border-slate-200/20">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeTab === "all" ? "bg-white text-slate-800 shadow-sm border border-slate-200/10" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  All ({campaigns.length})
                </button>
                <button
                  onClick={() => setActiveTab("active")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeTab === "active" ? "bg-white text-emerald-600 shadow-sm border border-emerald-100" : "text-slate-500 hover:text-emerald-600"
                  }`}
                >
                  Active ({activeCount})
                </button>
                <button
                  onClick={() => setActiveTab("inactive")}
                  className={`flex-1 py-1 rounded-lg text-center transition-all cursor-pointer ${
                    activeTab === "inactive" ? "bg-white text-slate-700 shadow-sm border border-slate-200/10" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Off ({campaigns.length - activeCount})
                </button>
              </div>
            </div>

            {/* Warning if clicks column missing */}
            {!hasLinkClicksHeader && (
              <div className="mx-3 my-2 p-2 bg-amber-50 border border-amber-200/60 rounded-xl flex gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-[10px] text-amber-800 leading-tight">
                  <span className="font-bold block">"Link clicks" column not found!</span>
                  Ensure "Link clicks" is visible in Ads Manager table.
                </div>
              </div>
            )}

            {/* Campaign List */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 custom-scrollbar">
              {filteredCampaigns.length > 0 ? (
                filteredCampaigns.map((camp) => (
                  <div
                    key={camp.id || camp.name}
                    onClick={() => setSelectedCampaign(camp)}
                    className="p-3 bg-white hover:bg-slate-50/50 border border-slate-200/50 hover:border-slate-300 rounded-2xl cursor-pointer transition-all duration-200 flex items-center justify-between group shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)]"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden mr-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          camp.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.35)]" : "bg-slate-300"
                        }`}
                        style={{ backgroundColor: camp.isActive ? '#10b981' : '#cbd5e1' }}
                      />
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-700 group-hover:text-slate-900 truncate" title={camp.name}>
                          {camp.name}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5 font-bold tracking-wider uppercase">
                          {camp.delivery || (camp.isActive ? "Active" : "Paused")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-1.5">
                      {camp.overrideLinkClicks && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse" title="Spoofed count" />
                      )}
                      <div className="bg-indigo-50/50 border border-indigo-100/60 px-2.5 py-1 rounded-xl">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider scale-90 -mb-0.5">Clicks</span>
                        <span className="text-xs font-extrabold text-indigo-600 font-mono">
                          {!isValueEmpty(camp.linkClicks) ? camp.linkClicks : "0"}
                        </span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center p-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  <p className="text-xs font-bold text-slate-500">No campaigns found</p>
                  <p className="text-[10px] text-slate-400 max-w-xs mt-1.5 leading-normal font-medium">
                    Scroll down the Ads Manager table to scan and load campaigns.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Detail Card Screen */
          <div className="flex-1 flex flex-col p-4 overflow-hidden">
            {/* Header / Back */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="p-1.5 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 transition-colors cursor-pointer border border-slate-200/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="overflow-hidden">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-wider mb-1 ${
                  selectedCampaign.isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200/20"
                }`}>
                  {selectedCampaign.isActive ? "Active" : "Inactive"}
                </span>
                <h2 className="text-xs font-bold text-slate-800 truncate w-72" title={selectedCampaign.name}>
                  {selectedCampaign.name}
                </h2>
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 custom-scrollbar">
              {/* Primary Metric - Link Clicks */}
              <div className="p-4 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/30 border border-indigo-100/70 rounded-2xl flex items-center justify-between shadow-[0_2px_8px_rgba(99,102,241,0.03)] relative overflow-hidden group">
                <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all duration-300" />
                <div className="flex-1 mr-2 relative z-10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Link clicks</span>
                    {selectedCampaign.overrideLinkClicks && (
                      <span className="px-1.5 py-0.5 rounded-lg text-[8px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200/30">
                        Spoofed
                      </span>
                    )}
                  </div>
                  {isEditingClicks ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-28 bg-white border border-indigo-500 text-slate-800 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        placeholder="New Clicks"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveOverride}
                        className="p-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-sm shadow-indigo-100"
                        title="Save custom value"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setIsEditingClicks(false)}
                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors cursor-pointer border border-slate-200/30"
                        title="Cancel"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-extrabold text-indigo-600 block font-mono">
                        {!isValueEmpty(selectedCampaign.linkClicks) ? selectedCampaign.linkClicks : "0"}
                      </span>
                      <button
                        onClick={() => {
                          setEditValue(selectedCampaign.overrideLinkClicks || selectedCampaign.linkClicks || "0");
                          setIsEditingClicks(true);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                        title="Edit value"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      {selectedCampaign.overrideLinkClicks && (
                        <button
                          onClick={handleResetOverride}
                          className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                          title="Reset to original value scraped from webpage"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-3 bg-indigo-600 text-white rounded-2xl shrink-0 shadow-md shadow-indigo-100 relative z-10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
              </div>

              {/* Core metrics grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-white border border-slate-200/50 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Amount spent</span>
                  <span className="text-sm font-extrabold text-slate-800 mt-1 block font-mono">
                    {!isValueEmpty(selectedCampaign.spend) ? selectedCampaign.spend : "$0.00"}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200/50 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Est. CPC</span>
                  <span className="text-sm font-extrabold text-indigo-600 mt-1 block font-mono">
                    {calculateCPC(selectedCampaign.spend, selectedCampaign.linkClicks)}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200/50 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Budget</span>
                  <span className="text-sm font-extrabold text-slate-800 mt-1 block truncate font-mono" title={selectedCampaign.budget}>
                    {!isValueEmpty(selectedCampaign.budget) ? selectedCampaign.budget : "N/A"}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200/50 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Est. CTR</span>
                  <span className="text-sm font-extrabold text-indigo-600 mt-1 block font-mono">
                    {calculateCTR(selectedCampaign.linkClicks, selectedCampaign.impressions)}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200/50 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Reach</span>
                  <span className="text-sm font-extrabold text-slate-800 mt-1 block font-mono">
                    {!isValueEmpty(selectedCampaign.reach) ? selectedCampaign.reach : "0"}
                  </span>
                </div>

                <div className="p-3 bg-white border border-slate-200/50 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Impressions</span>
                  <span className="text-sm font-extrabold text-slate-800 mt-1 block font-mono">
                    {!isValueEmpty(selectedCampaign.impressions) ? selectedCampaign.impressions : "0"}
                  </span>
                </div>
              </div>

              {/* Status and Additional Fields */}
              <div className="p-3 bg-slate-100/40 border border-slate-200/50 rounded-2xl space-y-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Delivery:</span>
                  <span className="text-slate-700 font-bold text-xs">{selectedCampaign.delivery || "Unknown"}</span>
                </div>
                {!isValueEmpty(selectedCampaign.results) && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Results:</span>
                    <span className="text-slate-700 font-bold text-xs">{selectedCampaign.results}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[8px]">Last Observed:</span>
                  <span className="text-slate-700 font-bold text-xs font-mono">
                    {selectedCampaign.lastSeen ? new Date(selectedCampaign.lastSeen).toLocaleTimeString() : "Just now"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600 animate-pulse"></span>
          </span>
          <span>
            {lastUpdated ? `Sync: ${new Date(lastUpdated).toLocaleTimeString()}` : "Not synced"}
          </span>
        </div>
        <div className="flex gap-2">
          {isOnAdsManager && (
            <button
              onClick={() => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "trigger_scan" });
              })}
              className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors cursor-pointer shadow-sm shadow-indigo-100"
            >
              Scan Page
            </button>
          )}
          <button
            onClick={handleClearCache}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 font-bold transition-colors cursor-pointer text-slate-600 shadow-sm"
          >
            Clear Cache
          </button>
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("react-target"));
root.render(<Popup />);
