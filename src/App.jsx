import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Zap, Target, ShieldAlert, Cpu, BatteryCharging, Waves, Activity, TrendingUp, Terminal, Brain, HelpCircle, Eye, ShieldCheck, ZapOff } from 'lucide-react';

// --- НАЛАШТУВАННЯ СВІТУ ---
const GRID_SIZE = 8;
const WALLS = [
  [0, 3], [1, 1], [1, 5], [1, 6], [2, 1], [2, 6],
  [3, 3], [4, 1], [4, 2], [4, 6], [5, 5],
  [6, 1], [6, 3], [7, 5]
];

const LASERS = [
  { pos: [2, 3], activeOn: [0, 1] },
  { pos: [5, 2], activeOn: [2, 3] }
];

const INITIAL_AGENT = [0, 0];
const GOAL = [7, 7];
const INITIAL_POLICE = [[3, 5], [5, 3]];

// RL Hyper-parameters
const LEARNING_RATE = 0.5;
const GAMMA = 0.98;
const INITIAL_EPSILON = 1.0;
const EPSILON_DECAY = 0.9995;
const MIN_EPSILON = 0.01;
const MAX_EPISODES = 8000;

const App = () => {
  const [agentPos, setAgentPos] = useState(INITIAL_AGENT);
  const [policePos, setPolicePos] = useState(INITIAL_POLICE);
  const [qTable, setQTable] = useState({});
  const [epsilon, setEpsilon] = useState(INITIAL_EPSILON);
  const [episodes, setEpisodes] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [status, setStatus] = useState("IDLE");
  const [successCount, setSuccessCount] = useState(0);
  const [logs, setLogs] = useState(["Система готова. Оберіть режим..."]);
  const [confidence, setConfidence] = useState(0);

  const addLog = (msg) => {
    setLogs(prev => [msg, ...prev].slice(0, 4));
  };

  const getKeyState = (aPos, pPos, steps) => {
    const laserCycle = steps % 4;
    const nearest = pPos.reduce((prev, curr) => {
      const dPrev = Math.abs(prev[0]-aPos[0]) + Math.abs(prev[1]-aPos[1]);
      const dCurr = Math.abs(curr[0]-aPos[0]) + Math.abs(curr[1]-aPos[1]);
      return dCurr < dPrev ? curr : prev;
    });
    return `${aPos[0]},${aPos[1]},${nearest[0]},${nearest[1]},${laserCycle}`;
  };

  const isWall = (r, c) => WALLS.some(([wr, wc]) => wr === r && wc === c);

  const movePolice = (pPos) => {
    return pPos.map(pos => {
      if (Math.random() > 0.4) return pos;
      const moves = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const move = moves[Math.floor(Math.random() * moves.length)];
      const newP = [pos[0] + move[0], pos[1] + move[1]];
      if (newP[0] >= 0 && newP[0] < GRID_SIZE && newP[1] >= 0 && newP[1] < GRID_SIZE && !isWall(newP[0], newP[1])) {
        return newP;
      }
      return pos;
    });
  };

  const getStepResult = (aPos, pPos, steps, action) => {
    let newAPos = [...aPos];
    if (action === 0 && aPos[0] > 0) newAPos[0]--;
    else if (action === 1 && aPos[0] < GRID_SIZE - 1) newAPos[0]++;
    else if (action === 2 && aPos[1] > 0) newAPos[1]--;
    else if (action === 3 && aPos[1] < GRID_SIZE - 1) newAPos[1]++;

    if (isWall(newAPos[0], newAPos[1])) newAPos = [...aPos];

    const nextPPos = movePolice(pPos);
    const nextSteps = steps + 1;
    
    const oldDist = Math.abs(aPos[0]-GOAL[0]) + Math.abs(aPos[1]-GOAL[1]);
    const newDist = Math.abs(newAPos[0]-GOAL[0]) + Math.abs(newAPos[1]-GOAL[1]);
    let reward = (oldDist - newDist) * 1.5; 

    let done = false;

    const laser = LASERS.find(l => l.pos[0] === newAPos[0] && l.pos[1] === newAPos[1]);
    if (laser && laser.activeOn.includes(nextSteps % 4)) {
      reward = -50;
      done = true;
    }

    if (nextPPos.some(p => p[0] === newAPos[0] && p[1] === newAPos[1])) {
      reward = -100;
      done = true;
    }

    if (newAPos[0] === GOAL[0] && newAPos[1] === GOAL[1]) {
      reward = 500;
      done = true;
    }

    return { newAPos, nextPPos, nextSteps, reward, done };
  };

  const runTrainingBatch = () => {
    let currentQ = { ...qTable };
    let currentEps = epsilon;
    let epCount = episodes;
    let localSuccess = 0;

    const BATCH_SIZE = 300; 
    for (let i = 0; i < BATCH_SIZE; i++) {
      let aPos = [...INITIAL_AGENT];
      let pPos = [...INITIAL_POLICE];
      let steps = 0;
      let done = false;

      while (!done && steps < 80) {
        const state = getKeyState(aPos, pPos, steps);
        if (!currentQ[state]) currentQ[state] = [0, 0, 0, 0];

        const action = Math.random() < currentEps 
          ? Math.floor(Math.random() * 4) 
          : currentQ[state].indexOf(Math.max(...currentQ[state]));

        const res = getStepResult(aPos, pPos, steps, action);
        const nextState = getKeyState(res.newAPos, res.nextPPos, res.nextSteps);
        if (!currentQ[nextState]) currentQ[nextState] = [0, 0, 0, 0];

        const nextMax = Math.max(...currentQ[nextState]);
        currentQ[state][action] += LEARNING_RATE * (res.reward + GAMMA * nextMax - currentQ[state][action]);

        aPos = res.newAPos;
        pPos = res.nextPPos;
        steps = res.nextSteps;
        done = res.done;
        if (done && res.reward > 100) localSuccess++;
      }
      currentEps = Math.max(MIN_EPSILON, currentEps * EPSILON_DECAY);
      epCount++;
    }

    setQTable(currentQ);
    setEpsilon(currentEps);
    setEpisodes(epCount);
    setSuccessCount(prev => prev + localSuccess);
    if (localSuccess > 0) addLog(`Успішність циклу: +${localSuccess}`);
  };

  useEffect(() => {
    if (isTraining && episodes < MAX_EPISODES) {
      const timer = setTimeout(runTrainingBatch, 1);
      return () => clearTimeout(timer);
    } else if (isTraining) {
      setIsTraining(false);
      setStatus("READY");
      addLog("Мережа навчена. Готовий до тесту.");
    }
  }, [isTraining, episodes]);

  const handleReset = () => {
    setIsRunning(false);
    setIsTraining(false);
    setIsRawMode(false);
    setQTable({});
    setEpsilon(INITIAL_EPSILON);
    setEpisodes(0);
    setSuccessCount(0);
    setAgentPos(INITIAL_AGENT);
    setPolicePos(INITIAL_POLICE);
    setStepCount(0);
    setConfidence(0);
    setStatus("IDLE");
    setLogs(["Ядро очищено. Чекаю..."]);
  };

  const startTest = (raw = false) => {
    setIsRunning(true);
    setIsRawMode(raw);
    setStatus(raw ? "RAW_RUN" : "TESTING");
    setAgentPos(INITIAL_AGENT);
    setPolicePos(INITIAL_POLICE);
    setStepCount(0);
    addLog(raw ? "Запуск без протоколів навчання..." : "Запуск бойового тесту...");
  };

  useEffect(() => {
    if (isRunning) {
      const timer = setInterval(() => {
        let action;
        let maxQ = 0;

        if (isRawMode) {
          action = Math.floor(Math.random() * 4);
          maxQ = 0;
        } else {
          const state = getKeyState(agentPos, policePos, stepCount);
          const actions = qTable[state] || [0, 0, 0, 0];
          maxQ = Math.max(...actions);
          action = actions.indexOf(maxQ);
        }
        
        setConfidence(maxQ);
        const res = getStepResult(agentPos, policePos, stepCount, action);
        
        setAgentPos(res.newAPos);
        setPolicePos(res.nextPPos);
        setStepCount(res.nextSteps);

        if (res.done || stepCount > 120) {
          setIsRunning(false);
          if (res.reward > 100) {
            setStatus("SUCCESS");
            addLog("МІСІЯ: УСПІХ.");
          } else {
            setStatus("FAILED");
            addLog(stepCount > 120 ? "ЧАС ВИЧЕРПАНО" : "ОБ'ЄКТ ЗНИЩЕНО");
          }
          clearInterval(timer);
        }
      }, 150);
      return () => clearInterval(timer);
    }
  }, [isRunning, agentPos, policePos, stepCount, isRawMode]);

  return (
    <div className="min-h-screen bg-slate-950 text-cyan-400 p-6 font-mono selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-6 border-b border-cyan-900/40 pb-4 gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/50">
            <Brain className="text-cyan-400 animate-pulse" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-magenta-500 uppercase tracking-tighter">
              DRIVE-X: Neuro-Protocol
            </h1>
            <p className="text-slate-500 text-[10px] uppercase tracking-[0.4em]">Benchmarking RL v2.5</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => { setStatus("TRAINING"); setIsTraining(true); }}
            disabled={isTraining || isRunning}
            className={`flex items-center gap-2 px-5 py-2 rounded border font-bold transition-all ${isTraining ? 'bg-cyan-500 text-black border-cyan-400' : 'border-cyan-500 hover:bg-cyan-500/10 disabled:opacity-30'}`}
          >
            <Cpu size={16} /> {isTraining ? 'TRAINING...' : 'TRAIN'}
          </button>
          
          <button 
            onClick={() => startTest(true)}
            disabled={isTraining || isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded border border-slate-700 text-slate-500 font-bold hover:text-yellow-500 hover:border-yellow-500 transition-all"
          >
            <ZapOff size={16} /> RAW
          </button>

          <button 
            onClick={() => startTest(false)}
            disabled={episodes < 100 || isTraining || isRunning}
            className="flex items-center gap-2 px-6 py-2 rounded bg-magenta-600 text-white font-bold hover:bg-magenta-500 disabled:opacity-30 transition-all shadow-[0_0_15px_rgba(219,39,119,0.3)]"
          >
            <Play size={16} /> TEST
          </button>

          <button onClick={handleReset} className="p-2 rounded border border-slate-800 hover:border-red-500 transition-colors">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Extensive Info */}
        <div className="lg:col-span-3 space-y-4">
          {/* Main Stats */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-4 text-cyan-500">
              <Activity size={14} />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">Core Metrics</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[9px] mb-1">
                  <span>LEARNING PROGRESS</span>
                  <span>{Math.floor((episodes/MAX_EPISODES)*100)}%</span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" style={{ width: `${(episodes / MAX_EPISODES) * 100}%` }}></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/40 p-2 rounded border border-slate-800/50">
                  <div className="text-[8px] text-slate-500">SUCCESS</div>
                  <div className="text-sm font-bold text-green-400">{successCount}</div>
                </div>
                <div className="bg-black/40 p-2 rounded border border-slate-800/50">
                  <div className="text-[8px] text-slate-500">EPISODES</div>
                  <div className="text-sm font-bold text-white">{episodes}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Strategy Info */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-3 text-magenta-500">
              <Eye size={14} />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">Live Strategy</h2>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-800 pb-1">
                <span className="text-slate-500">Current Conf:</span>
                <span className={`font-bold ${isRawMode ? 'text-slate-500' : 'text-white'}`}>
                  {isRawMode ? "N/A" : confidence.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-800 pb-1">
                <span className="text-slate-500">Epsilon (Expl):</span>
                <span className="text-yellow-500 font-bold">{(epsilon * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-800 pb-1">
                <span className="text-slate-500">Q-Table Size:</span>
                <span className="text-cyan-500 font-bold">{Object.keys(qTable).length}</span>
              </div>
            </div>
          </div>

          {/* Monitor */}
          <div className="bg-black/60 border border-slate-800 p-4 rounded-xl min-h-[120px]">
            <div className="flex items-center gap-2 mb-2 text-cyan-500/50">
              <Terminal size={12} />
              <span className="text-[9px] font-bold uppercase tracking-widest">System Output</span>
            </div>
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className={`text-[9px] font-mono leading-tight ${i === 0 ? 'text-cyan-400' : 'text-slate-600'}`}>
                  {`>> ${log}`}
                </div>
              ))}
            </div>
          </div>

          <div className={`p-4 rounded-lg border-2 text-center font-black tracking-tighter transition-all ${
            status === "SUCCESS" ? "bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]" :
            status === "FAILED" ? "bg-red-500/20 border-red-500 text-red-400" :
            status === "RAW_RUN" ? "bg-yellow-500/10 border-yellow-500 text-yellow-500 animate-pulse" :
            status === "TESTING" ? "bg-blue-500/20 border-blue-500 text-blue-400 animate-pulse" :
            "bg-slate-900 border-slate-800 text-slate-500"
          }`}>
            {status}
          </div>
        </div>

        {/* Right Column: Grid Area */}
        <div className="lg:col-span-9 flex flex-col items-center bg-slate-900/20 rounded-2xl border border-slate-800/40 p-6">
          <div className="relative p-3 bg-slate-950 rounded-lg shadow-2xl border border-cyan-500/20">
            {/* Grid Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-5 rounded-lg">
              <div className="w-full h-1/2 bg-gradient-to-b from-transparent via-cyan-400 to-transparent animate-scan" />
            </div>

            <div className="grid gap-2 relative z-10" style={{ 
                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                // Створюємо ідеальні квадрати незалежно від розміру екрану
                width: 'min(70vw, 520px)',
              }}>
              {[...Array(GRID_SIZE * GRID_SIZE)].map((_, i) => {
                const r = Math.floor(i / GRID_SIZE);
                const c = i % GRID_SIZE;
                const isA = agentPos[0] === r && agentPos[1] === c;
                const isG = GOAL[0] === r && GOAL[1] === c;
                const isP = policePos.some(p => p[0] === r && p[1] === c);
                const isW = isWall(r, c);
                const laser = LASERS.find(l => l.pos[0] === r && l.pos[1] === c);
                const isLActive = laser && (stepCount % 4 === 0 || stepCount % 4 === 1);

                return (
                  <div key={i} className={`aspect-square relative rounded flex items-center justify-center transition-all ${
                    isW ? 'bg-slate-800/50 shadow-inner' : 
                    isG ? 'bg-yellow-500/5' :
                    'bg-slate-950 border border-slate-900'
                  }`}>
                    {isG && <Target className="text-yellow-400 drop-shadow-[0_0_8px_#facc15] animate-pulse" size="65%" />}
                    
                    {laser && (
                      <div className={`absolute inset-0 flex items-center justify-center rounded transition-colors ${isLActive ? 'bg-red-500/20' : ''}`}>
                        <Waves className={isLActive ? 'text-red-500 drop-shadow-[0_0_5px_red]' : 'text-slate-800'} size="60%" />
                      </div>
                    )}

                    {isA && (
                      <div className="absolute z-30 w-full h-full p-1.5 transition-all duration-150 transform scale-110">
                         <div className={`w-full h-full rounded-sm flex flex-col items-center justify-center shadow-lg ${isRawMode ? 'bg-yellow-500 shadow-yellow-500/40' : 'bg-cyan-500 shadow-cyan-500/40'}`}>
                            <Zap size="60%" className="text-black" />
                            {!isRawMode && confidence > 0 && (
                              <div className="absolute -top-5 text-[7px] bg-black border border-cyan-500 px-1 text-cyan-400 font-bold whitespace-nowrap">
                                Q:{confidence.toFixed(0)}
                              </div>
                            )}
                         </div>
                      </div>
                    )}

                    {isP && (
                      <div className="absolute z-20 w-3/4 h-3/4 bg-magenta-600 rounded-full shadow-[0_0_12px_#d946ef] flex items-center justify-center border-2 border-magenta-400/50 animate-pulse">
                        <ShieldAlert size="60%" className="text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend Area (Нижні підписи) */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-5 gap-6 w-full max-w-4xl border-t border-slate-800/50 pt-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center shadow-[0_0_10px_#06b6d4]">
                <Zap size={16} className="text-black" />
              </div>
              <div className="text-[10px] leading-tight">
                <div className="text-white font-bold uppercase">Агент (AI)</div>
                <div className="text-slate-500">Навчається на помилках</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-magenta-600 rounded-full flex items-center justify-center shadow-[0_0_10px_#d946ef]">
                <ShieldAlert size={16} className="text-white" />
              </div>
              <div className="text-[10px] leading-tight">
                <div className="text-white font-bold uppercase">Патруль</div>
                <div className="text-slate-500">Мобільна загроза</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 border border-red-500 flex items-center justify-center">
                <Waves size={16} className="text-red-500" />
              </div>
              <div className="text-[10px] leading-tight">
                <div className="text-white font-bold uppercase">Лазер</div>
                <div className="text-slate-500">Циклічна пастка</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-800 rounded flex items-center justify-center">
                <div className="w-4 h-4 bg-slate-700 rounded-sm"></div>
              </div>
              <div className="text-[10px] leading-tight">
                <div className="text-white font-bold uppercase">Стіна</div>
                <div className="text-slate-500">Непрохідний блок</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-yellow-500/10 border border-yellow-500/50 rounded flex items-center justify-center">
                <Target size={16} className="text-yellow-400" />
              </div>
              <div className="text-[10px] leading-tight">
                <div className="text-white font-bold uppercase">Ціль</div>
                <div className="text-slate-500">Точка евакуації</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(200%); }
        }
        .animate-scan {
          animation: scan 4s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default App;