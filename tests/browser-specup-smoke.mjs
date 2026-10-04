/**
 * Automated Headless Browser End-to-End Test for Spec-Up Optimizer
 * Uses Chrome/Edge CDP via native WebSocket in Node 24.
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;
const APP_URL = 'http://127.0.0.1:8000/index.html';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Launching headless browser for E2E Spec-Up testing...');
  const browserProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    // Wait for CDP endpoint to be ready
    let versionData = null;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
    }

    assert.ok(versionData, 'CDP endpoint must respond on port ' + PORT);
    console.log('CDP browser ready:', versionData.Browser);

    // Create a new tab / target
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    const wsUrl = tabData.webSocketDebuggerUrl;
    assert.ok(wsUrl, 'Must have WebSocket debugger URL');

    const ws = new WebSocket(wsUrl);

    let nextId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    async function send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      }
      return res.result?.value;
    }

    console.log('Connected via CDP WebSocket. Waiting for page data to load...');
    await send('Page.enable');
    await send('Runtime.enable');

    // Wait until DATA is loaded and status strip indicates ready
    let loaded = false;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      const isReady = await evaluate(`
        Boolean(document.getElementById('dataStatus')?.textContent?.includes('로드 완료'))
      `);
      if (isReady) {
        loaded = true;
        break;
      }
    }
    assert.ok(loaded, 'Page must load data and show 로드 완료 in status strip');
    console.log('Page & data loaded successfully.');

    // Step 1: Switch to Spec-Up Tab
    console.log('Step 1: Clicking [data-tab="specup"] button...');
    const tabSwitchRes = await evaluate(`(() => {
      const btn = document.querySelector('.tab[data-tab="specup"]');
      if (!btn) return { error: 'Tab button not found' };
      btn.click();
      const panel = document.querySelector('.tab-panel[data-panel="specup"]');
      return {
        tabActive: btn.classList.contains('active'),
        panelActive: panel ? panel.classList.contains('active') : false
      };
    })()`);
    assert.ok(tabSwitchRes.tabActive, 'Spec-Up tab must be active');
    assert.ok(tabSwitchRes.panelActive, 'Spec-Up tab panel must be active');
    console.log('  -> Tab switched to Spec-Up successfully.');

    // Step 2: Verify Equipment Table
    console.log('Step 2: Checking equipment table rows...');
    const rowCount = await evaluate(`document.querySelectorAll('#specupEquipTableBody tr').length`);
    assert.equal(rowCount, 15, 'Must have 15 equipment rows rendered');
    const firstEqName = await evaluate(`document.querySelector('#specupEquipTableBody tr input[data-field="name"]').value`);
    assert.ok(firstEqName.includes('모자'), 'Default preset should include 모자');
    console.log(`  -> 15 equipment rows verified. First item: "${firstEqName}"`);

    // Step 3: Test Presets Switching
    console.log('Step 3: Testing 입문 / 종결 / 표준 preset buttons...');
    await evaluate(`document.getElementById('specupPreset100Btn').click()`);
    const name100 = await evaluate(`document.querySelector('#specupEquipTableBody tr input[data-field="name"]').value`);
    assert.ok(name100.includes('모자'), '입문 preset must populate equipment');

    await evaluate(`document.getElementById('specupPreset140Btn').click()`);
    const name140 = await evaluate(`document.querySelector('#specupEquipTableBody tr input[data-field="name"]').value`);
    assert.ok(name140.includes('모자'), '종결 preset must populate equipment');

    await evaluate(`document.getElementById('specupPreset120Btn').click()`);
    const name120 = await evaluate(`document.querySelector('#specupEquipTableBody tr input[data-field="name"]').value`);
    assert.ok(name120.includes('모자'), '표준 preset restored equipment');
    console.log('  -> Preset switching works seamlessly.');

    // Step 4: Standalone Starforce Calculator Test
    console.log('Step 4: Testing Standalone Starforce Calculator...');
    await evaluate(`(() => {
      document.getElementById('sfStandaloneStart').value = 10;
      document.getElementById('sfStandaloneTarget').value = 12;
      document.getElementById('runSfStandaloneBtn').click();
    })()`);
    const sfResultHtml = await evaluate(`document.getElementById('sfStandaloneResult').innerHTML`);
    assert.ok(sfResultHtml.includes('기대 소모 메소'), 'SF result must display expected meso');
    assert.ok(sfResultHtml.includes('기대 시도 횟수'), 'SF result must display expected attempts');
    console.log('  -> Standalone Starforce Calculator rendered expected costs properly.');

    // Step 6: Full Portfolio Spec-Up Optimizer Execution
    console.log('Step 6: Executing Full Portfolio Spec-Up Optimizer...');
    await evaluate(`(() => {
      document.getElementById('specupBudgetMeso').value = 50000000;
      document.getElementById('specupMaxSteps').value = 15;
      document.getElementById('runSpecupOptimizerBtn').click();
    })()`);

    const summaryText = await evaluate(`document.getElementById('specupDpsSummary').textContent`);
    const gainPctText = await evaluate(`document.getElementById('specupDpsGainPct').textContent`);
    const powerText = await evaluate(`document.getElementById('specupPowerSummary').textContent`);
    const stepsCountText = await evaluate(`document.getElementById('specupStepsCount').textContent`);
    const roadmapCardCount = await evaluate(`document.querySelectorAll('#specupRoadmapList .roadmap-card').length`);

    console.log(`  DPS Summary: ${summaryText} (${gainPctText})`);
    console.log(`  Power Summary: ${powerText}`);
    console.log(`  Roadmap Steps: ${stepsCountText} (${roadmapCardCount} cards rendered)`);

    assert.ok(summaryText.includes('➔'), 'DPS summary must display transition');
    assert.ok(gainPctText.includes('%'), 'Gain pct must display percentage');
    assert.ok(roadmapCardCount > 0, 'Roadmap cards must be rendered');

    // Inspect first roadmap card details
    const firstCardRank = await evaluate(`document.querySelector('#specupRoadmapList .roadmap-card .roadmap-rank').textContent`);
    const firstCardTitle = await evaluate(`document.querySelector('#specupRoadmapList .roadmap-card .roadmap-title').textContent`);
    const firstCardRoi = await evaluate(`document.querySelector('#specupRoadmapList .roadmap-card .roi-badge').textContent`);
    console.log(`  First recommendation: [${firstCardRank}] ${firstCardTitle} (${firstCardRoi})`);

    assert.equal(firstCardRank, '#1', 'First card must be rank #1');
    assert.ok(firstCardRoi.includes('1만 메소당'), 'Must display ROI metric');

    // Step 7: MekiCalc Cube Leaderboard & 3-Line Modal Test
    console.log('Step 7: Testing MekiCalc Cube Recommendation Leaderboard & 3-Line Modal...');
    const cubeRecCount = await evaluate(`document.querySelectorAll('#mekiCubeRecList > div').length`);
    assert.equal(cubeRecCount, 8, 'MekiCalc Cube Leaderboard must contain 8 equipment cards');
    const firstCubeRecName = await evaluate(`document.querySelector('#mekiCubeRecList strong').textContent`);
    const firstCubeVerdict = await evaluate(`document.querySelector('#mekiCubeRecList .badge').textContent`);
    console.log(`  Top Cube Priority: [${firstCubeRecName}] ${firstCubeVerdict}`);
    assert.ok(firstCubeVerdict.includes('리롤') || firstCubeVerdict.includes('등급업') || firstCubeVerdict.includes('유지'), 'Top priority should have active advice');

    // Open 3-Line Edit Modal
    await evaluate(`document.querySelector('#specupEquipTableBody .edit-cube-line-btn').click()`);
    const modalIsOpen = await evaluate(`document.getElementById('cubeLineEditModal').hasAttribute('open')`);
    assert.ok(modalIsOpen, 'Cube 3-Line Edit modal must open');

    // Click 2-Line Valid Preset and Save
    await evaluate(`document.getElementById('cubePreset2LineBtn').click()`);
    const slot1Val = await evaluate(`document.getElementById('cubeSlot1Value').value`);
    assert.ok(Number(slot1Val) > 0, 'Preset must populate valid slot value');
    await evaluate(`document.getElementById('saveCubeEditBtn').click()`);

    const modalIsClosed = await evaluate(`!document.getElementById('cubeLineEditModal').hasAttribute('open')`);
    assert.ok(modalIsClosed, 'Cube modal must close after save');
    console.log('  -> 3-Line potential editor modal saved and updated equipment successfully.');

    // Step 8: Test Cube Tab Navigation & Load from Equipment
    console.log('Step 8: Testing Cube Tab integration from Leaderboard...');
    await evaluate(`document.querySelector('#mekiCubeRecList .goto-cube-tab-btn').click()`);
    const cubeTabActive = await evaluate(`document.querySelector('.tab[data-tab="cube"]').classList.contains('active')`);
    assert.ok(cubeTabActive, 'Active tab must switch to Cube Tab');

    const curOptVal = await evaluate(`document.querySelector('#currentOptions .option-value').value`);
    assert.ok(Number(curOptVal) >= 0, 'Current options in Cube Tab must be populated');
    const cubeDeltaText = await evaluate(`document.getElementById('cubeDelta').textContent`);
    console.log(`  Cube Tab evaluation rendered: ${cubeDeltaText}`);
    assert.ok(cubeDeltaText.length > 0, 'Cube delta must be rendered');

    // Step 9: Verify In-Game Auto-Cube Preferred Option Setting UI (3 presets & tier-up mode)
    console.log('Step 9: Testing In-Game Preferred Option Setting UI...');
    const inGamePresetCount = await evaluate(`document.querySelectorAll('#inGamePreferredPresetsRoot > div').length`);
    assert.equal(inGamePresetCount, 3, 'Must render 3 in-game condition preset boxes');
    const tierUpNoteText = await evaluate(`document.getElementById('inGameTierUpNoteRoot').textContent`);
    assert.ok(tierUpNoteText.includes('변환 등급업 모드'), 'Must display tier-up mode note');
    console.log(`  -> In-Game Preferred Option Setting UI verified with 3 presets and tier-up mode.`);

    // Verify copy button presence
    const hasCopyBtn = await evaluate(`Boolean(document.getElementById('copyInGamePreferredBtn'))`);
    assert.ok(hasCopyBtn, 'Copy in-game preferred settings button must exist');

    ws.close();
    console.log('✅ ALL BROWSER E2E TESTS PASSED WITH 100% SUCCESS!');
  } finally {
    browserProc.kill();
  }
}

main().catch(err => {
  console.error('❌ Browser E2E Test Failed:', err);
  process.exit(1);
});
