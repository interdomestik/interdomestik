import { expect, type Locator, type Page } from '@playwright/test';

export const PANEL = '[data-testid="messaging-panel"]';
export const PANEL_CONTENT = '[data-testid="messaging-panel-content"]';
export const REFRESH = '[data-testid="messaging-refresh"]';
export const RETRY = '[data-testid="messaging-read-retry"]';
export const READ_ERROR = '[data-testid="messaging-read-error"]';
export const EMPTY = '[data-testid="messaging-empty-state"]';
export const COUNT = '[data-testid="messaging-count"]';
export const DRAFT = '[data-testid="message-input"]';

// The controls whose boxes must stay inside any clipping ancestor within the panel.
export const CLIPPABLE_TEST_IDS = [
  'messaging-read-retry',
  'messaging-read-error',
  'message-input',
] as const;

// One measured clipping ancestor of a control, with the real overshoot on each edge.
type ClipEntry = {
  ancestor: string;
  overflowX: string;
  overflowY: string;
  rect: { x: number; y: number; width: number; height: number };
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export async function rootFontSize(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  );
}

// Reads the real boxes once per phase: document, panel, the scrolling content column and the
// operator controls, plus every clipping ancestor between a control and the panel. Nothing is
// mutated here. A scrollable ancestor is not a clipping ancestor: its content stays reachable.
export async function collectPanelDiagnostics(page: Page, phase: string) {
  return page.evaluate(
    ({ panelSelector, contentSelector, testIds, phaseLabel }) => {
      const rectOf = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const boxOf = (element: Element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      });
      const clips = (style: CSSStyleDeclaration) =>
        [style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip');

      const panel = document.querySelector(panelSelector);
      const content = panel?.querySelector(contentSelector) ?? null;
      const panelStyle = panel ? getComputedStyle(panel) : null;
      const contentStyle = content ? getComputedStyle(content) : null;

      const elements = testIds.map(testId => {
        const element = panel?.querySelector(`[data-testid="${testId}"]`) ?? null;
        if (!element) {
          return { testId, found: false, rect: null, clipping: [] as ClipEntry[] };
        }

        const rect = rectOf(element);
        const ancestors: Element[] = [];
        let node: Element | null = element.parentElement;
        while (node) {
          if (clips(getComputedStyle(node))) ancestors.push(node);
          if (node === panel) break;
          node = node.parentElement;
        }

        const clipping: ClipEntry[] = ancestors.map(ancestor => {
          const style = getComputedStyle(ancestor);
          const box = rectOf(ancestor);
          return {
            ancestor:
              ancestor.getAttribute('data-testid') ??
              `${ancestor.tagName.toLowerCase()}.${ancestor.className}`,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            rect: box,
            left: box.x - rect.x,
            right: rect.x + rect.width - (box.x + box.width),
            top: box.y - rect.y,
            bottom: rect.y + rect.height - (box.y + box.height),
          };
        });

        return { testId, found: true, rect, clipping };
      });

      return {
        phase: phaseLabel,
        rootFontPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        root: {
          ...boxOf(document.documentElement),
          overflowX: getComputedStyle(document.documentElement).overflowX,
        },
        body: { ...boxOf(document.body), overflowX: getComputedStyle(document.body).overflowX },
        panel:
          panel && panelStyle
            ? {
                ...boxOf(panel),
                height: panelStyle.height,
                maxHeight: panelStyle.maxHeight,
                overflowX: panelStyle.overflowX,
                overflowY: panelStyle.overflowY,
              }
            : null,
        content:
          content && contentStyle
            ? {
                testId: content.getAttribute('data-testid'),
                ...boxOf(content),
                height: contentStyle.height,
                overflowX: contentStyle.overflowX,
                overflowY: contentStyle.overflowY,
              }
            : null,
        elements,
      };
    },
    {
      panelSelector: PANEL,
      contentSelector: PANEL_CONTENT,
      testIds: [...CLIPPABLE_TEST_IDS],
      phaseLabel: phase,
    }
  );
}

export type PanelDiagnostics = Awaited<ReturnType<typeof collectPanelDiagnostics>>;

// Clipping is judged against the real ancestor boxes inside the panel, not against document
// viewport visibility, and no overflow is suppressed to obtain a pass.
export function expectNotClippedInsidePanel(diagnostics: PanelDiagnostics) {
  expect(diagnostics.panel).not.toBeNull();
  for (const element of diagnostics.elements) {
    expect(element.found, `${element.testId} is present inside the panel`).toBe(true);
    for (const clip of element.clipping) {
      const where = `${element.testId} inside ${clip.ancestor} (${clip.overflowX}/${clip.overflowY})`;
      expect(clip.left, `${where} clipped on the left`).toBeLessThanOrEqual(1);
      expect(clip.right, `${where} clipped on the right`).toBeLessThanOrEqual(1);
      expect(clip.top, `${where} clipped on the top`).toBeLessThanOrEqual(1);
      expect(clip.bottom, `${where} clipped on the bottom`).toBeLessThanOrEqual(1);
    }
  }
}

export async function expectFitsWithoutOverflow(
  diagnostics: PanelDiagnostics,
  locators: readonly Locator[]
) {
  const clientWidth = diagnostics.root.clientWidth;

  for (const locator of locators) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth + 1);
  }

  // Document-level width only proves something when nothing is clipping it away.
  const clipped = [diagnostics.root.overflowX, diagnostics.body.overflowX].some(
    value => value === 'hidden' || value === 'clip'
  );
  if (!clipped) {
    expect(diagnostics.root.scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    expect(diagnostics.body.scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  }

  return { clientWidth, clipped };
}
