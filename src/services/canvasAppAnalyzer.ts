import type { AnalysisResult } from './flowAnalyzer.ts';
import type { CanvasAppFiles, ControlNode, DataSourceEntry } from './canvasAppService.ts';
import type { CanvasAppAdminInfo } from './canvasAppAdminService.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAllControls(node: ControlNode): ControlNode[] {
  return [node, ...(node.Children ?? []).flatMap(getAllControls)];
}

function getAllFormulas(node: ControlNode): Array<{ control: string; property: string; formula: string }> {
  const results: Array<{ control: string; property: string; formula: string }> = [];
  for (const rule of node.Rules ?? []) {
    if (rule.InvariantScript?.trim()) {
      results.push({ control: node.Name ?? '', property: rule.Property ?? '', formula: rule.InvariantScript });
    }
  }
  for (const child of node.Children ?? []) {
    results.push(...getAllFormulas(child));
  }
  return results;
}

function hasNestedGallery(node: ControlNode, parentIsGallery: boolean): boolean {
  const isGallery = node.Type?.toLowerCase().includes('gallery') ?? false;
  if (parentIsGallery && isGallery) return true;
  return (node.Children ?? []).some(c => hasNestedGallery(c, parentIsGallery || isGallery));
}

// ─── Analyser ─────────────────────────────────────────────────────────────────

export function analyzeCanvasApp(files: CanvasAppFiles, adminInfo?: CanvasAppAdminInfo): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  // For YAML-format apps we only have synthetic screen entries with control counts
  const isJsonFormat = files.format === 'json';

  const allScreenControls = isJsonFormat
    ? files.screens.flatMap(s => s.controls.flatMap(getAllControls))
    : [];
  const allFormulas = isJsonFormat
    ? files.screens.flatMap(s => s.controls.flatMap(getAllFormulas))
    : [];
  const allFormulaText = allFormulas.map(f => f.formula).join('\n');

  // ── 1. Too many data sources ──────────────────────────────────────────────
  if (files.dataSources.length > 10) {
    results.push({
      id: 'canvas-too-many-datasources',
      title: 'Excessive data source connections',
      description: `The app has ${files.dataSources.length} data sources. Apps with many connections authenticate all of them at startup, increasing load time.`,
      recommendation: 'Consolidate data access via Dataverse where possible. Remove unused data sources from the Data panel.',
      severity: 'warning',
      affectedItems: files.dataSources.map(d => d.Name ?? 'Unknown').slice(0, 8),
    });
  }

  // ── 2. Missing app description ────────────────────────────────────────────
  if (!files.properties?.Description?.trim()) {
    results.push({
      id: 'canvas-no-description',
      title: 'Missing app description',
      description: 'The app has no description, making it harder for admins and users to understand its purpose in the environment.',
      recommendation: 'Add a description via Settings → General → Description.',
      severity: 'info',
    });
  }

  // ── 3. Too many screens ───────────────────────────────────────────────────
  if (files.screens.length > 20) {
    results.push({
      id: 'canvas-too-many-screens',
      title: `High screen count (${files.screens.length} screens)`,
      description: 'Very large apps load more slowly and are harder to maintain. Each screen adds to the overall bundle.',
      recommendation: 'Consider splitting into multiple apps, or use a single-screen pattern with visible/hidden containers.',
      severity: 'warning',
    });
  }

  // ── 4. Screens with too many controls ────────────────────────────────────
  const heavyScreens = files.screens.filter(s => s.totalControls > 100);
  if (heavyScreens.length > 0) {
    results.push({
      id: 'canvas-too-many-controls',
      title: 'Screens with too many controls',
      description: `${heavyScreens.length} screen(s) contain more than 100 controls. This significantly impacts rendering performance.`,
      recommendation: 'Break complex screens into multiple screens. Encapsulate repeated groups of controls into components.',
      severity: 'critical',
      affectedItems: heavyScreens.map(s => `${s.name} (${s.totalControls} controls)`),
    });
  }

  // ── 5. Nested galleries ───────────────────────────────────────────────────
  if (isJsonFormat) {
    const nestedGalleryScreens = files.screens
      .filter(s => s.controls.some(c => hasNestedGallery(c, false)))
      .map(s => s.name);
    if (nestedGalleryScreens.length > 0) {
      results.push({
        id: 'canvas-nested-gallery',
        title: 'Nested galleries detected',
        description: 'A gallery inside another gallery causes exponential rendering overhead and is a well-known performance anti-pattern.',
        recommendation: 'Flatten your data or use a different layout. Consider a table/data grid control instead.',
        severity: 'critical',
        affectedItems: nestedGalleryScreens,
      });
    }
  }

  // ── 6. Hardcoded URLs in formulas ─────────────────────────────────────────
  if (isJsonFormat) {
    const urlFormulas = allFormulas.filter(f => /https?:\/\/[a-z0-9]/i.test(f.formula));
    if (urlFormulas.length > 0) {
      results.push({
        id: 'canvas-hardcoded-url',
        title: 'Hardcoded URLs in formulas',
        description: 'URLs hardcoded in formulas break when endpoints change and make environment promotion manual.',
        recommendation: 'Store endpoint URLs in environment variables (Power Apps > Settings > Environment variables) or App.Formulas.',
        severity: 'warning',
        affectedItems: [...new Set(urlFormulas.map(f => f.control))].slice(0, 8),
      });
    }
  }

  // ── 7. Hardcoded email addresses ──────────────────────────────────────────
  if (isJsonFormat) {
    const emailFormulas = allFormulas.filter(f =>
      /["'][a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}["']/i.test(f.formula),
    );
    if (emailFormulas.length > 0) {
      results.push({
        id: 'canvas-hardcoded-email',
        title: 'Hardcoded email addresses in formulas',
        description: 'Hardcoded emails break when users change and fail in different environment deployments.',
        recommendation: 'Use User().Email or Office365Users.MyProfile().Mail rather than literal email addresses.',
        severity: 'warning',
        affectedItems: [...new Set(emailFormulas.map(f => f.control))].slice(0, 6),
      });
    }
  }

  // ── 8. Excessive RGBA() color usage ──────────────────────────────────────
  if (isJsonFormat) {
    const colorFormulas = allFormulas.filter(f => /\bRGBA\s*\(/i.test(f.formula));
    if (colorFormulas.length > 8) {
      results.push({
        id: 'canvas-hardcoded-colors',
        title: `Excessive hardcoded colors (${colorFormulas.length} occurrences)`,
        description: 'Heavy use of RGBA() instead of theme tokens makes rebranding and dark-mode support very difficult.',
        recommendation: 'Define colors as named formulas in App.Formulas or use App.Theme.Colors for consistent, maintainable styling.',
        severity: 'info',
        affectedItems: [...new Set(colorFormulas.map(f => f.control))].slice(0, 8),
      });
    }
  }

  // ── 9. Collect/Patch/RemoveIf inside gallery items ────────────────────────
  if (isJsonFormat) {
    const galleryControls = allScreenControls.filter(c => c.Type?.toLowerCase().includes('gallery'));
    const badGalleries = galleryControls.filter(g => {
      const formulas = getAllFormulas(g);
      return formulas.some(f => /\b(Collect|Patch|RemoveIf|UpdateIf|Remove)\s*\(/i.test(f.formula));
    });
    if (badGalleries.length > 0) {
      results.push({
        id: 'canvas-write-in-gallery',
        title: 'Write operations inside gallery items',
        description: 'Calling Collect(), Patch(), or RemoveIf() inside gallery item formulas runs once per visible item, causing excessive API calls (n+1 problem).',
        recommendation: 'Move write operations outside the gallery. Use a selected-item variable and trigger the write from a button outside the gallery.',
        severity: 'critical',
        affectedItems: badGalleries.map(c => c.Name ?? 'Gallery').slice(0, 6),
      });
    }
  }

  // ── 10. Heavy App.OnStart ─────────────────────────────────────────────────
  if (isJsonFormat) {
    const onStart = allFormulas.find(f =>
      (f.property === 'OnStart' || f.property === 'App.OnStart') && f.control.toLowerCase() === 'app',
    );
    if (onStart && onStart.formula.length > 500) {
      results.push({
        id: 'canvas-heavy-onstart',
        title: `Heavy App.OnStart (${onStart.formula.length} chars)`,
        description: 'Long App.OnStart formulas increase app load time because they execute synchronously before the first screen renders.',
        recommendation: 'Move data loading to the first screen\'s OnVisible. Use Concurrent() for parallel loads.',
        severity: 'warning',
      });
    }
  }

  // ── 11. Multiple loads without Concurrent() ───────────────────────────────
  if (isJsonFormat) {
    const onVisibleForms = allFormulas.filter(f => f.property === 'OnVisible');
    const withoutConcurrent = onVisibleForms.filter(f => {
      const setCount = (f.formula.match(/\bSet\s*\(/g) ?? []).length;
      return setCount > 2 && !/\bConcurrent\s*\(/i.test(f.formula);
    });
    if (withoutConcurrent.length > 0) {
      results.push({
        id: 'canvas-no-concurrent',
        title: 'Multiple sequential loads in OnVisible',
        description: 'OnVisible formulas with multiple Set() calls execute sequentially. Wrapping them in Concurrent() can parallelize the data loading.',
        recommendation: 'Use Concurrent(Set(varA, QueryA), Set(varB, QueryB)) to load data in parallel.',
        severity: 'info',
        affectedItems: withoutConcurrent.map(f => f.control).slice(0, 5),
      });
    }
  }

  // ── 12. No App.OnError handler ────────────────────────────────────────────
  if (isJsonFormat) {
    const appOnError = allFormulas.find(f =>
      f.property === 'OnError' && f.control.toLowerCase() === 'app',
    );
    if (!appOnError || !appOnError.formula.trim()) {
      results.push({
        id: 'canvas-no-onerror',
        title: 'No App.OnError handler',
        description: 'Without App.OnError, unhandled Power Fx errors silently fail or show raw system messages to users.',
        recommendation: 'Add App.OnError = Notify(FirstError.Message, NotificationType.Error) as a baseline error handler.',
        severity: 'warning',
      });
    }
  }

  // ── 13. Forms missing OnFailure ───────────────────────────────────────────
  if (isJsonFormat) {
    const formControls = allScreenControls.filter(c => c.Type?.toLowerCase().includes('form'));
    const formsWithoutFailure = formControls.filter(form => {
      const rules = form.Rules ?? [];
      return rules.some(r => r.Property === 'OnSuccess') &&
        !rules.some(r => r.Property === 'OnFailure' && r.InvariantScript?.trim());
    });
    if (formsWithoutFailure.length > 0) {
      results.push({
        id: 'canvas-form-no-onfailure',
        title: 'Edit forms without OnFailure handler',
        description: 'Forms that define OnSuccess but no OnFailure silently ignore submission errors, leaving users without feedback.',
        recommendation: 'Add OnFailure = Notify("Submission failed: " & FirstError.Message, NotificationType.Error).',
        severity: 'warning',
        affectedItems: formsWithoutFailure.map(c => c.Name ?? 'Form').slice(0, 6),
      });
    }
  }

  // ── 14. SubmitForm without input validation ───────────────────────────────
  if (isJsonFormat) {
    const submitSelects = allFormulas.filter(f =>
      f.property === 'OnSelect' && /\bSubmitForm\s*\(/i.test(f.formula),
    );
    const withoutValidation = submitSelects.filter(f =>
      !/\b(IsBlank|IsMatch|IsEmpty|Validate)\s*\(/i.test(f.formula),
    );
    if (withoutValidation.length > 0) {
      results.push({
        id: 'canvas-no-form-validation',
        title: 'SubmitForm() without input validation',
        description: 'Buttons that call SubmitForm() without checking IsBlank() or IsMatch() can submit invalid data.',
        recommendation: 'Guard SubmitForm() with validation: If(IsBlank(TextInput.Text), Notify("Required"), SubmitForm(Form1)).',
        severity: 'warning',
        affectedItems: withoutValidation.map(f => f.control).slice(0, 5),
      });
    }
  }

  // ── 15. ForAll() on delegable sources ────────────────────────────────────
  if (isJsonFormat) {
    const forAllUsage = allFormulas.filter(f => /\bForAll\s*\(/i.test(f.formula));
    if (forAllUsage.length > 0) {
      results.push({
        id: 'canvas-forall-delegation',
        title: 'ForAll() may be limited to first 500 records',
        description: `${forAllUsage.length} formula(s) use ForAll(). When used directly on a delegable data source, Power Apps limits the input to 500 records (or your data row limit).`,
        recommendation: 'Materialize data into a local collection first: Collect(colData, DataSource); then run ForAll(colData, ...).',
        severity: 'info',
        affectedItems: [...new Set(forAllUsage.map(f => `${f.control}.${f.property}`))].slice(0, 5),
      });
    }
  }

  // ── 16. Large embedded media resources ────────────────────────────────────
  const largeResources = files.resources.filter(r => (r.sizeBytes ?? 0) > 200_000);
  if (largeResources.length > 0) {
    results.push({
      id: 'canvas-large-media',
      title: 'Large embedded media files',
      description: `${largeResources.length} embedded resource(s) exceed 200 KB. Embedded media bloats the app and increases download time for all users.`,
      recommendation: 'Host images and media in SharePoint or Azure Blob Storage and reference them via URLs instead of embedding in the app.',
      severity: 'warning',
      affectedItems: largeResources.map(r => `${r.Name ?? r.FileName ?? 'Unknown'} (${Math.round((r.sizeBytes ?? 0) / 1024)} KB)`).slice(0, 6),
    });
  }

  // ── 17. Unused data sources ────────────────────────────────────────────────
  if (isJsonFormat && allFormulaText.length > 0) {
    const unused = files.dataSources.filter(ds =>
      ds.Name && !allFormulaText.includes(ds.Name),
    );
    if (unused.length > 0) {
      results.push({
        id: 'canvas-unused-datasources',
        title: 'Potentially unused data sources',
        description: `${unused.length} data source(s) do not appear in any formula. Unused connections still authenticate at app startup.`,
        recommendation: 'Remove unused data sources from the Data panel to reduce startup auth overhead.',
        severity: 'info',
        affectedItems: unused.map(d => d.Name ?? 'Unknown').slice(0, 6),
      });
    }
  }

  // ── 18. Fixed non-responsive layout ───────────────────────────────────────
  const w = files.properties?.DocumentLayoutWidth;
  if (w && w !== 0 && isJsonFormat) {
    const usesResponsiveProps = /\bApp\.Width\b|\bApp\.Height\b|\bParent\.Width\b|\bParent\.Height\b/i.test(allFormulaText);
    if (!usesResponsiveProps) {
      results.push({
        id: 'canvas-fixed-layout',
        title: 'Fixed layout — not responsive',
        description: `App uses a fixed canvas of ${w}×${files.properties?.DocumentLayoutHeight ?? '?'}px and no formulas reference App.Width or App.Height. The app will not adapt to different screen sizes.`,
        recommendation: 'Switch to an Auto-layout or use App.Width/App.Height in position and size formulas for responsive design.',
        severity: 'info',
      });
    }
  }

  // ── 19. SharePoint lists used as primary database ─────────────────────────
  const spSources = files.dataSources.filter(d =>
    d.ApiId?.toLowerCase().includes('sharepointonline') ||
    d.Type?.toLowerCase().includes('sharepoint'),
  );
  if (spSources.length > 0 && files.dataSources.length > 0 && spSources.length === files.dataSources.length) {
    results.push({
      id: 'canvas-sharepoint-only',
      title: 'App uses only SharePoint data sources',
      description: 'Apps that rely exclusively on SharePoint lists often hit delegation limits and performance bottlenecks for large datasets.',
      recommendation: 'For complex relational data or > 5,000 records, consider migrating to Dataverse which offers full delegation and richer query support.',
      severity: 'info',
      affectedItems: spSources.map(d => d.Name ?? 'Unknown').slice(0, 5),
    });
  }

  // ── 21. Oversharing — too many individual users ───────────────────────────
  if (adminInfo) {
    if (adminInfo.sharedUsersCount > 500) {
      results.push({
        id: 'canvas-overshared-users',
        title: `App shared with ${adminInfo.sharedUsersCount.toLocaleString()} users`,
        description: 'Sharing an app with large numbers of individual users is difficult to manage and review. It may indicate the app is being used as a broad distribution channel.',
        recommendation: 'Share via security groups or Entra ID groups instead of individual user assignments. This makes access easier to manage and audit.',
        severity: 'warning',
      });
    } else if (adminInfo.sharedUsersCount > 100) {
      results.push({
        id: 'canvas-overshared-users',
        title: `App shared with ${adminInfo.sharedUsersCount} individual users`,
        description: 'More than 100 individual user assignments can be difficult to manage. Consider group-based access for easier governance.',
        recommendation: 'Consolidate access into Entra ID security groups and share the app with those groups instead.',
        severity: 'info',
      });
    }

    // ── 22. Bypass consent enabled ────────────────────────────────────────────
    if (adminInfo.bypassConsent) {
      results.push({
        id: 'canvas-bypass-consent',
        title: 'Consent bypass is enabled',
        description: 'Bypass consent allows users to run the app and use its connections without an explicit consent prompt. This can expose connections and data to users without their explicit acknowledgment.',
        recommendation: 'Only enable bypass consent for internal enterprise apps where users are clearly informed about data access through other means (e.g., training, policy).',
        severity: 'warning',
      });
    }

    // ── 23. Premium connectors in use ─────────────────────────────────────────
    const premiumConns = adminInfo.connectionReferences.filter(
      c => c.apiTier?.toLowerCase() === 'premium',
    );
    if (premiumConns.length > 0) {
      results.push({
        id: 'canvas-premium-connectors',
        title: `${premiumConns.length} premium connector(s) in use`,
        description: 'Premium connectors require all users of the app to have a Power Apps Premium licence (per-user or per-app plan). Using them without confirming licensing can cause users to be blocked.',
        recommendation: 'Verify that all intended users have the appropriate Power Apps licence. Document the licence requirement in the app description.',
        severity: 'info',
        affectedItems: premiumConns.map(c => c.displayName ?? c.id ?? '').filter(Boolean).slice(0, 6),
      });
    }

    // ── 24. On-premises gateway connections ───────────────────────────────────
    const onPremConns = adminInfo.connectionReferences.filter(c => c.isOnPremiseConnection);
    if (onPremConns.length > 0) {
      results.push({
        id: 'canvas-on-premises-connection',
        title: `${onPremConns.length} on-premises gateway connection(s)`,
        description: 'On-premises data gateway connections add a dependency on gateway infrastructure availability and introduce latency. If the gateway goes offline, the app stops working.',
        recommendation: 'Ensure gateway infrastructure is highly available. Consider migrating on-premises data sources to cloud equivalents where possible.',
        severity: 'info',
        affectedItems: onPremConns.map(c => c.displayName ?? c.id ?? '').filter(n => n.length > 0).slice(0, 5),
      });
    }
  }

  return results;
}
