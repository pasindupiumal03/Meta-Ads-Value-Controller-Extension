// Initialize globally on Facebook Ads Manager to support SPA client-side routing
if (window.location.hostname.includes("adsmanager.facebook.com") && new Date() < new Date('2026-06-28')) {
  console.log("[Meta Scraper] Extension content script loaded.");

  // Helper to set innermost text node content safely preserving wrappers
  const setInnermostText = (element, text) => {
    if (!element) return;
    let current = element;
    while (current.children && current.children.length > 0) {
      current = current.children[0];
    }
    if (current && current.textContent !== text) {
      current.textContent = text;
    }
  };

  // Scraper function
  const scrapeAdsManager = (existingCampaigns) => {
    // Dynamically check if we are currently on the campaigns table page
    if (!window.location.pathname.includes("/adsmanager/manage/campaigns")) {
      return null;
    }

    const data = {
      campaigns: {},
      hasLinkClicksHeader: false
    };

    // Find all cells that belong to table rows
    const cells = document.querySelectorAll('[data-surface*="table_row:"]');
    if (cells.length === 0) {
      console.log("[Meta Scraper] No data-surface cells found. Running fallback scraper...");
      return scrapeFallback(existingCampaigns);
    }

    // Determine visual sorting order by collecting Name cell IDs from top to bottom
    const rowIdsOrder = [];
    cells.forEach(cell => {
      const dataSurface = cell.getAttribute('data-surface');
      const match = dataSurface.match(/\/am\/table\/table_row:(\d+)unit\/table_cell:(.+)/);
      if (match) {
        const rowId = match[1];
        const colType = match[2];
        // The name cells in the DOM tree visual order are top-to-bottom
        if (colType.includes('name') && !rowIdsOrder.includes(rowId)) {
          rowIdsOrder.push(rowId);
        }
      }
    });

    console.log(`[Meta Scraper] Found ${cells.length} row cells. Grouping by Campaign ID...`);

    // Group cells by Campaign/Row ID (e.g., table_row:120210942987570608unit)
    const rowsMap = {};
    cells.forEach(cell => {
      const dataSurface = cell.getAttribute('data-surface');
      const match = dataSurface.match(/\/am\/table\/table_row:(\d+)unit\/table_cell:(.+)/);
      if (match) {
        const rowId = match[1];
        const colType = match[2];
        if (!rowsMap[rowId]) {
          rowsMap[rowId] = {};
        }
        rowsMap[rowId][colType] = cell;
      }
    });

    console.log(`[Meta Scraper] Identified ${Object.keys(rowsMap).length} distinct campaign rows.`);

    // Process each grouped row
    Object.keys(rowsMap).forEach(rowId => {
      const rowObj = rowsMap[rowId];

      // 1. Get Campaign/Object Name
      const nameColKey = Object.keys(rowObj).find(k => k.includes('name'));
      const nameCell = nameColKey ? rowObj[nameColKey] : null;
      if (!nameCell) return;

      const aLink = nameCell.querySelector('a');
      let name = "";
      if (aLink) {
        const innerSpan = aLink.querySelector('span');
        name = (innerSpan ? innerSpan.textContent : aLink.textContent).trim();
      } else {
        name = nameCell.textContent.trim();
      }

      // Clean up common button action text that might leak in during raw text scrape
      const cleanLabels = ["Open Dropdown", "Charts", "Edit", "Duplicate", "Compare", "View charts", "View Charts", "View Setup"];
      cleanLabels.forEach(label => {
        if (name.includes(label)) {
          name = name.split(label)[0].trim();
        }
      });

      if (!name || name === "Campaign" || name === "Off / On" || name === "Delivery" || name === "Results") return;

      // 2. Get Link clicks (ensure exact match, excluding CPC/CTR)
      const clicksColKey = Object.keys(rowObj).find(k => {
        const lower = k.toLowerCase();
        return lower.includes('link_click') && 
               !lower.includes('cost') && 
               !lower.includes('rate') && 
               !lower.includes('cpc') && 
               !lower.includes('ctr');
      });
      const clicksCell = clicksColKey ? rowObj[clicksColKey] : null;
      let linkClicks = clicksCell ? clicksCell.textContent.trim() : null;
      let originalLinkClicks = null;
      let overrideLinkClicks = null;

      const existingCamp = existingCampaigns ? existingCampaigns[rowId] : null;
      if (existingCamp) {
        overrideLinkClicks = existingCamp.overrideLinkClicks || null;
        originalLinkClicks = existingCamp.originalLinkClicks || null;
      }

      if (clicksCell) {
        if (overrideLinkClicks !== null && overrideLinkClicks !== undefined) {
          if (!originalLinkClicks) {
            originalLinkClicks = linkClicks;
          }
          setInnermostText(clicksCell, overrideLinkClicks);
          linkClicks = overrideLinkClicks;
        } else if (originalLinkClicks) {
          // Restore original if override was cleared
          setInnermostText(clicksCell, originalLinkClicks);
          linkClicks = originalLinkClicks;
          originalLinkClicks = null;
        }
      }

      // 3. Get Spend
      const spendCell = rowObj['spend'] || rowObj[Object.keys(rowObj).find(k => k.includes('spend'))];
      let spend = spendCell ? spendCell.textContent.trim() : null;

      // 4. Get Budget
      const budgetColKey = Object.keys(rowObj).find(k => k.includes('budget'));
      const budgetCell = budgetColKey ? rowObj[budgetColKey] : null;
      let budget = budgetCell ? budgetCell.textContent.trim() : null;

      // 5. Get Impressions
      const impressionsCell = rowObj['impressions'] || rowObj[Object.keys(rowObj).find(k => k.includes('impressions'))];
      let impressions = impressionsCell ? impressionsCell.textContent.trim() : null;

      // 6. Get Reach
      const reachCell = rowObj['reach'] || rowObj[Object.keys(rowObj).find(k => k.includes('reach'))];
      let reach = reachCell ? reachCell.textContent.trim() : null;

      // 7. Get Status (Active/Inactive)
      const toggleColKey = Object.keys(rowObj).find(k => k.includes('toggle'));
      const toggleCell = toggleColKey ? rowObj[toggleColKey] : null;
      let isActive = false;
      if (toggleCell) {
        const checkbox = toggleCell.querySelector('input[type="checkbox"], [role="checkbox"], [role="switch"]');
        if (checkbox) {
          isActive = checkbox.getAttribute('aria-checked') === 'true' || checkbox.checked || checkbox.value === "true";
        } else {
          const checkedElement = toggleCell.querySelector('[aria-checked="true"]');
          isActive = !!checkedElement;
        }
      }

      // 8. Get Results
      const resultsColKey = Object.keys(rowObj).find(k => k.includes('results'));
      const resultsCell = resultsColKey ? rowObj[resultsColKey] : null;
      let results = resultsCell ? resultsCell.textContent.trim() : null;

      // 9. Get Delivery
      const deliveryColKey = Object.keys(rowObj).find(k => k.includes('delivery'));
      const deliveryCell = deliveryColKey ? rowObj[deliveryColKey] : null;
      let delivery = deliveryCell ? deliveryCell.textContent.trim() : null;

      // Visual visualIndex
      const visualIndex = rowIdsOrder.indexOf(rowId);

      // Use rowId (unique Campaign ID) as the key to prevent duplicates overwriting
      data.campaigns[rowId] = {
        id: rowId,
        name,
        linkClicks,
        originalLinkClicks,
        overrideLinkClicks,
        spend,
        budget,
        impressions,
        reach,
        isActive,
        results,
        delivery,
        sortOrder: visualIndex !== -1 ? visualIndex : 999,
        lastSeen: Date.now()
      };
    });

    // Check headers to see if link clicks column is present
    const headers = document.querySelectorAll('[role="columnheader"]');
    let hasLinkClicks = false;
    headers.forEach(header => {
      const text = header.textContent.toLowerCase();
      const hasLinkClicksAttr = Array.from(header.querySelectorAll('*')).some(el => {
        const ds = (el.getAttribute('data-surface') || '').toLowerCase();
        return ds.includes('link_click') && !ds.includes('cost') && !ds.includes('rate') && !ds.includes('cpc') && !ds.includes('ctr');
      });
      if (text === 'link clicks' || hasLinkClicksAttr) {
        hasLinkClicks = true;
      }
    });
    data.hasLinkClicksHeader = hasLinkClicks;

    return data;
  };

  // Fallback row-based scraper
  const scrapeFallback = (existingCampaigns) => {
    const data = {
      campaigns: {},
      hasLinkClicksHeader: false
    };

    const rows = document.querySelectorAll('div[role="row"], div[class*="_1gda"]');
    if (rows.length === 0) return null;

    rows.forEach((row, idx) => {
      if (row.querySelector('[role="columnheader"]')) return;

      let name = "";
      const nameCell = row.querySelector('[data-surface*="name"]') || row.querySelector('div[id*="js_"] div[class*="ellipsis"]');
      if (nameCell) {
        const aLink = nameCell.querySelector('a');
        name = (aLink ? aLink.textContent : nameCell.textContent).trim();
      }

      if (!name || name === "Campaign" || name === "Off / On") {
        const allLinks = Array.from(row.querySelectorAll('a'));
        for (const link of allLinks) {
          const txt = link.textContent.trim();
          if (txt && txt !== "Campaign" && txt !== "Edit" && txt !== "View Setup" && txt !== "View Charts") {
            name = txt;
            break;
          }
        }
      }

      if (!name || name === "Campaign" || name === "Off / On" || name === "Delivery") return;

      // Generate a mock ID for fallback
      const rowId = `fallback_${idx}`;

      const clicksCells = Array.from(row.querySelectorAll('[data-surface*="link_click"], [data-surface*="actions:link_click"]'));
      const clicksCell = clicksCells.find(cell => {
        const ds = (cell.getAttribute('data-surface') || '').toLowerCase();
        return !ds.includes('cost') && !ds.includes('rate') && !ds.includes('cpc') && !ds.includes('ctr');
      }) || null;
      let linkClicks = clicksCell ? clicksCell.textContent.trim() : null;
      let originalLinkClicks = null;
      let overrideLinkClicks = null;

      const existingCamp = existingCampaigns ? existingCampaigns[rowId] : null;
      if (existingCamp) {
        overrideLinkClicks = existingCamp.overrideLinkClicks || null;
        originalLinkClicks = existingCamp.originalLinkClicks || null;
      }

      if (clicksCell) {
        if (overrideLinkClicks !== null && overrideLinkClicks !== undefined) {
          if (!originalLinkClicks) {
            originalLinkClicks = linkClicks;
          }
          setInnermostText(clicksCell, overrideLinkClicks);
          linkClicks = overrideLinkClicks;
        } else if (originalLinkClicks) {
          setInnermostText(clicksCell, originalLinkClicks);
          linkClicks = originalLinkClicks;
          originalLinkClicks = null;
        }
      }

      const spendCell = row.querySelector('[data-surface*="spend"]') || row.querySelector('[data-surface*="amount_spent"]');
      let spend = spendCell ? spendCell.textContent.trim() : null;

      const budgetCell = row.querySelector('[data-surface*="budget"]');
      let budget = budgetCell ? budgetCell.textContent.trim() : null;

      const impressionsCell = row.querySelector('[data-surface*="impressions"]');
      let impressions = impressionsCell ? impressionsCell.textContent.trim() : null;

      const reachCell = row.querySelector('[data-surface*="reach"]');
      let reach = reachCell ? reachCell.textContent.trim() : null;

      const toggleCell = row.querySelector('[data-surface*="toggle"]');
      let isActive = false;
      if (toggleCell) {
        const checkbox = toggleCell.querySelector('input[type="checkbox"], [role="checkbox"], [role="switch"]');
        if (checkbox) {
          isActive = checkbox.getAttribute('aria-checked') === 'true' || checkbox.checked;
        }
      }

      data.campaigns[rowId] = {
        id: rowId,
        name,
        linkClicks,
        originalLinkClicks,
        overrideLinkClicks,
        spend,
        budget,
        impressions,
        reach,
        isActive,
        sortOrder: idx,
        lastSeen: Date.now()
      };
    });

    const headers = document.querySelectorAll('[role="columnheader"]');
    let hasLinkClicks = false;
    headers.forEach(header => {
      const text = header.textContent.toLowerCase();
      if (text.includes('link clicks')) {
        hasLinkClicks = true;
      }
    });
    data.hasLinkClicksHeader = hasLinkClicks;

    return data;
  };

  let lastWrittenTotal = null;
  let originalTotalClicks = null;

  const parseNumber = (val) => {
    if (!val || val === "-" || val === "—" || val === "\u2014" || val === "\u2013") return 0;
    const cleaned = val.replace(/[^\d.]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const formatNumberWithCommas = (num, useCommas) => {
    if (useCommas) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    return num.toString();
  };

  const parseLeftStyle = (el) => {
    const style = el.getAttribute('style') || '';
    const match = style.match(/left:\s*([\d.]+)px/);
    return match ? parseFloat(match[1]) : null;
  };

  const findTotalLinkClicksCell = () => {
    // 1. Find the Link Clicks column alignment reference
    const headers = document.querySelectorAll('[role="columnheader"]');
    let targetLeft = -1;
    let targetRight = -1;
    let targetLeftStyle = null;

    headers.forEach(header => {
      const text = header.textContent.toLowerCase();
      const hasLinkClicksAttr = Array.from(header.querySelectorAll('*')).some(el => {
        const ds = (el.getAttribute('data-surface') || '').toLowerCase();
        return ds.includes('link_click') && !ds.includes('cost') && !ds.includes('rate') && !ds.includes('cpc') && !ds.includes('ctr');
      });
      if (text === 'link clicks' || hasLinkClicksAttr) {
        const rect = header.getBoundingClientRect();
        targetLeft = rect.left;
        targetRight = rect.right;
        
        const leftVal = parseLeftStyle(header);
        if (leftVal !== null) {
          targetLeftStyle = leftVal;
        }
      }
    });

    // Fallback to row cell alignment
    if (targetLeftStyle === null && targetLeft === -1) {
      const allClicksCells = Array.from(document.querySelectorAll('[data-surface*="link_click"], [data-surface*="actions:link_click"]'));
      const clicksCells = allClicksCells.filter(cell => {
        const ds = (cell.getAttribute('data-surface') || '').toLowerCase();
        return !ds.includes('cost') && !ds.includes('rate') && !ds.includes('cpc') && !ds.includes('ctr');
      });
      if (clicksCells.length > 0) {
        const rect = clicksCells[0].getBoundingClientRect();
        targetLeft = rect.left;
        targetRight = rect.right;
        
        const leftVal = parseLeftStyle(clicksCells[0]);
        if (leftVal !== null) {
          targetLeftStyle = leftVal;
        }
      }
    }

    if (targetLeft === -1 && targetLeftStyle === null) return null;

    // 2. Find elements containing exactly "Total"
    const allElements = document.querySelectorAll('*');
    const totalLabels = Array.from(allElements).filter(el => {
      return el.children.length === 0 && el.textContent.trim() === "Total";
    });

    for (const label of totalLabels) {
      let parentCell = label.parentElement;
      while (parentCell && parentCell !== document.body) {
        const cellLeft = parseLeftStyle(parentCell);
        if (targetLeftStyle !== null && cellLeft !== null) {
          if (Math.abs(cellLeft - targetLeftStyle) < 1) {
            const labelParent = label.closest('._1b33._av2o') || label.closest('div[class*="_1b33"]');
            if (labelParent) {
              const valContainer = labelParent.querySelector('[geotextcolor="value"]') || labelParent.children[0];
              if (valContainer && valContainer !== label.parentElement) {
                return valContainer;
              }
            }
          }
        } else {
          const rect = parentCell.getBoundingClientRect();
          const midX = (rect.left + rect.right) / 2;

          if (midX >= targetLeft && midX <= targetRight) {
            const labelParent = label.closest('._1b33._av2o') || label.closest('div[class*="_1b33"]');
            if (labelParent) {
              const valContainer = labelParent.querySelector('[geotextcolor="value"]') || labelParent.children[0];
              if (valContainer && valContainer !== label.parentElement) {
                return valContainer;
              }
            }
          }
        }
        parentCell = parentCell.parentElement;
      }
    }

    return null;
  };

  const updateTotalClicksOnPage = (campaignsList) => {
    try {
      const totalCell = findTotalLinkClicksCell();
      if (!totalCell) return;

      const currentDOMText = totalCell.textContent.trim();
      
      // If the DOM text differs from our last written total, it has been updated by the page
      if (currentDOMText !== lastWrittenTotal) {
        originalTotalClicks = currentDOMText;
      }

      if (originalTotalClicks !== null && originalTotalClicks !== "") {
        let delta = 0;
        Object.values(campaignsList).forEach(camp => {
          if (camp.overrideLinkClicks !== null && camp.overrideLinkClicks !== undefined) {
            const origVal = parseNumber(camp.originalLinkClicks || camp.linkClicks || "0");
            const overVal = parseNumber(camp.overrideLinkClicks);
            delta += (overVal - origVal);
          }
        });

        if (delta !== 0) {
          const origTotalNum = parseNumber(originalTotalClicks);
          const newTotalNum = Math.max(0, origTotalNum + delta);
          const formattedTotal = formatNumberWithCommas(newTotalNum, originalTotalClicks.includes(","));

          if (currentDOMText !== formattedTotal) {
            setInnermostText(totalCell, formattedTotal);
            lastWrittenTotal = formattedTotal;
            console.log(`[Meta Spoof] Updated Total Clicks to ${formattedTotal} (Delta: ${delta})`);
          }
        } else {
          // If delta is 0, restore original total if currently spoofed
          if (currentDOMText !== originalTotalClicks) {
            setInnermostText(totalCell, originalTotalClicks);
            lastWrittenTotal = originalTotalClicks;
          }
        }
      }
    } catch (err) {
      console.error("[Meta Spoof] Error updating total clicks:", err);
    }
  };

  // Update storage with merged campaigns
  const updateScrapedData = async () => {
    try {
      const storageKey = 'meta_ads_data';
      
      // Get existing data from storage first
      const result = await new Promise(resolve => {
        chrome.storage.local.get([storageKey], res => resolve(res));
      });
      
      const existing = result[storageKey] || { campaigns: {} };
      const scraped = scrapeAdsManager(existing.campaigns);
      if (!scraped) {
        // Even if we didn't scrape new data, still apply the total click overrides to the visible DOM
        updateTotalClicksOnPage(existing.campaigns);
        return;
      }

      console.log(`[Meta Scraper] Scraped ${Object.keys(scraped.campaigns).length} campaigns. Saving to storage...`);
      
      const mergedCampaigns = {};

      // Clean up legacy name-based keys from storage
      Object.keys(existing.campaigns).forEach(key => {
        if (/^\d+$/.test(key) || key.startsWith("fallback_")) {
          mergedCampaigns[key] = existing.campaigns[key];
        }
      });

      // Merge new data
      Object.keys(scraped.campaigns).forEach(id => {
        mergedCampaigns[id] = {
          ...mergedCampaigns[id],
          ...scraped.campaigns[id],
          lastSeen: Date.now()
        };
      });

      // Write back
      await new Promise(resolve => {
        chrome.storage.local.set({
          [storageKey]: {
            campaigns: mergedCampaigns,
            lastUpdated: Date.now(),
            hasLinkClicksHeader: scraped.hasLinkClicksHeader
          }
        }, () => resolve());
      });

      // Update Total Clicks on the webpage
      updateTotalClicksOnPage(mergedCampaigns);
    } catch (e) {
      console.error("Meta Scraper Extension Error:", e);
    }
  };

  let cachedCampaigns = {};

  const loadCache = () => {
    chrome.storage.local.get(['meta_ads_data'], (result) => {
      const data = result.meta_ads_data || { campaigns: {} };
      cachedCampaigns = data.campaigns || {};
      applyOverridesToDOM();
    });
  };
  loadCache();

  // Listen to storage changes to update cache instantly
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.meta_ads_data) {
      const data = changes.meta_ads_data.newValue || { campaigns: {} };
      cachedCampaigns = data.campaigns || {};
      applyOverridesToDOM();
    }
  });

  const applyOverridesToDOM = () => {
    // 1. Apply overrides to regular cells
    const cells = document.querySelectorAll('[data-surface*="table_row:"]');
    cells.forEach(cell => {
      const dataSurface = cell.getAttribute('data-surface');
      const match = dataSurface.match(/\/am\/table\/table_row:(\d+)unit\/table_cell:(.+)/);
      if (match) {
        const rowId = match[1];
        const colType = match[2];
        
        // Ensure we only match the actual Link Clicks column
        const isClicksCol = colType.toLowerCase().includes('link_click') && 
                            !colType.toLowerCase().includes('cost') && 
                            !colType.toLowerCase().includes('rate') && 
                            !colType.toLowerCase().includes('cpc') && 
                            !colType.toLowerCase().includes('ctr');

        if (isClicksCol) {
          const camp = cachedCampaigns[rowId];
          if (camp && camp.overrideLinkClicks !== null && camp.overrideLinkClicks !== undefined) {
            setInnermostText(cell, camp.overrideLinkClicks);
          }
        }
      }
    });

    // 2. Apply overrides to fallback cells (if any)
    const rows = document.querySelectorAll('div[role="row"], div[class*="_1gda"]');
    rows.forEach((row, idx) => {
      if (row.querySelector('[role="columnheader"]')) return;
      const rowId = `fallback_${idx}`;
      const camp = cachedCampaigns[rowId];
      if (camp && camp.overrideLinkClicks !== null && camp.overrideLinkClicks !== undefined) {
        const clicksCells = Array.from(row.querySelectorAll('[data-surface*="link_click"], [data-surface*="actions:link_click"]'));
        const clicksCell = clicksCells.find(cell => {
          const ds = (cell.getAttribute('data-surface') || '').toLowerCase();
          return !ds.includes('cost') && !ds.includes('rate') && !ds.includes('cpc') && !ds.includes('ctr');
        });
        if (clicksCell) {
          setInnermostText(clicksCell, camp.overrideLinkClicks);
        }
      }
    });

    // 3. Update Total row
    updateTotalClicksOnPage(cachedCampaigns);
  };

  // MutationObserver to apply overrides instantly as soon as new elements mount
  let frameRequested = false;
  const observer = new MutationObserver(() => {
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(() => {
        applyOverridesToDOM();
        frameRequested = false;
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Run scraper periodically
  setInterval(updateScrapedData, 1500);

  // Set up message listener for manual scans or clears
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "trigger_scan") {
      updateScrapedData().then(() => sendResponse({ success: true }));
      return true; // async response
    }
    if (message.action === "clear_data") {
      chrome.storage.local.remove('meta_ads_data', () => sendResponse({ success: true }));
      return true;
    }
  });
}