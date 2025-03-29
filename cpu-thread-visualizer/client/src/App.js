// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';

// Configuration
const API_BASE_URL =  'http://localhost:8080/api' || process.env.REACT_APP_API_BASE_URL ;
const REFRESH_INTERVAL = 2000; // 2 seconds

function App() {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [activeTaskCount, setActiveTaskCount] = useState(0);
  const [algorithm, setAlgorithm] = useState('round_robin');
  const [taskDuration, setTaskDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Connect to the agent through the cloud API
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/agent/health`);
        setConnected(response.data.status === 'healthy');
      } catch (err) {
        setConnected(false);
        setError('Cannot connect to the agent. Make sure it\'s running.');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Fetch stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      if (!connected) return;
      
      try {
        const response = await axios.get(`${API_BASE_URL}/agent/stats`);
        setStats(response.data);
        setActiveTaskCount(response.data.active_tasks.length);
        setAlgorithm(response.data.algorithm);
        
        // Update CPU history
        setCpuHistory(prevHistory => {
          const newPoint = {
            time: new Date().toLocaleTimeString(),
            ...response.data.cpu_percent_per_core.reduce((acc, val, idx) => {
              acc[`Core ${idx}`] = val;
              return acc;
            }, {})
          };
          
          const newHistory = [...prevHistory, newPoint];
          if (newHistory.length > 20) newHistory.shift(); // Keep last 20 points
          return newHistory;
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      }
    };

    if (connected) {
      fetchStats(); // Fetch immediately
      const interval = setInterval(fetchStats, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [connected]);

  // Change scheduling algorithm
  const changeAlgorithm = async (newAlgorithm) => {
    try {
      setLoading(true);
      await axios.post(`${API_BASE_URL}/agent/set_algorithm`, { algorithm: newAlgorithm });
      setAlgorithm(newAlgorithm);
    } catch (err) {
      setError(`Failed to change algorithm: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Run a new task
  const runTask = async (type) => {
    try {
      setLoading(true);
      await axios.post(`${API_BASE_URL}/agent/run_task`, { 
        type, 
        duration: taskDuration 
      });
    } catch (err) {
      setError(`Failed to start task: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Clear task history
  const clearHistory = async () => {
    try {
      await axios.post(`${API_BASE_URL}/agent/clear_history`);
    } catch (err) {
      setError(`Failed to clear history: ${err.message}`);
    }
  };

  // Generate colors for thread visualization
  const getThreadColor = (threadId) => {
    // Simple hash function to generate consistent colors for thread IDs
    const hash = String(threadId).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  return (
    <div className="App p-4 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2">CPU Thread Visualizer</h1>
        <div className="flex items-center mb-4">
          <div className={`h-3 w-3 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>{connected ? 'Connected to agent' : 'Disconnected'}</span>
        </div>
        {error && <div className="bg-red-100 text-red-800 p-2 rounded mb-4">{error}</div>}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CPU Usage Chart */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-3">CPU Usage</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                {stats && stats.cpu_percent_per_core.map((_, idx) => (
                  <Line 
                    key={idx}
                    type="monotone"
                    dataKey={`Core ${idx}`}
                    stroke={`hsl(${(idx * 30) % 360}, 70%, 50%)`}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Thread Allocation */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-3">Thread Allocation</h2>
          <div className="h-64 overflow-auto">
            {stats && stats.task_history.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={Math.max(200, stats.task_history.length * 40)}>
                  <BarChart
                    layout="vertical"
                    data={stats.task_history.map(task => ({
                      id: task.task_id.substring(0, 8),
                      thread: `Thread ${task.thread_id}`,
                      duration: task.duration || 0,
                      type: task.type,
                      threadId: task.thread_id
                    }))}
                    margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="thread" type="category" />
                    <Tooltip 
                      formatter={(value, name, props) => [
                        `${value.toFixed(2)}s`, 
                        name === 'duration' ? 'Duration' : name
                      ]}
                      labelFormatter={(value) => `Task ${value}`}
                    />
                    <Bar dataKey="duration" name="Duration">
                      {
                        stats.task_history.map((task, index) => (
                          <Cell key={`cell-${index}`} fill={getThreadColor(task.thread_id)} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                No task history available
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white p-4 rounded shadow md:col-span-2">
          <h2 className="text-xl font-semibold mb-3">Controls</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Algorithm Selection */}
            <div>
              <h3 className="font-medium mb-2">Scheduling Algorithm</h3>
              <div className="flex flex-col space-y-2">
                <button
                  className={`px-3 py-2 rounded ${algorithm === 'round_robin' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  onClick={() => changeAlgorithm('round_robin')}
                  disabled={loading}
                >
                  Round Robin
                </button>
                <button
                  className={`px-3 py-2 rounded ${algorithm === 'random' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  onClick={() => changeAlgorithm('random')}
                  disabled={loading}
                >
                  Random
                </button>
                <button
                  className={`px-3 py-2 rounded ${algorithm === 'least_connections' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                  onClick={() => changeAlgorithm('least_connections')}
                  disabled={loading}
                >
                  Least Connections
                </button>
              </div>
            </div>

            {/* Task Generation */}
            <div>
              <h3 className="font-medium mb-2">Generate Tasks</h3>
              <div className="mb-2">
                <label className="block text-sm text-gray-600">Duration (seconds)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="border rounded px-2 py-1 w-20"
                  value={taskDuration}
                  onChange={(e) => setTaskDuration(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  className="bg-green-600 text-white px-3 py-2 rounded"
                  onClick={() => runTask('cpu_intensive')}
                  disabled={loading || !connected}
                >
                  CPU Intensive Task
                </button>
                <button
                  className="bg-purple-600 text-white px-3 py-2 rounded"
                  onClick={() => runTask('io_bound')}
                  disabled={loading || !connected}
                >
                  I/O Bound Task
                </button>
              </div>
            </div>

            {/* System Info */}
            <div>
              <h3 className="font-medium mb-2">System Information</h3>
              {stats && (
                <div className="text-sm">
                  <p><span className="font-semibold">CPU Cores:</span> {stats.cpu_count}</p>
                  <p><span className="font-semibold">Active Tasks:</span> {activeTaskCount}</p>
                  <p><span className="font-semibold">Average CPU:</span> {(stats.cpu_average || 0).toFixed(1)}%</p>
                  <p><span className="font-semibold">Memory Usage:</span> {stats.memory_percent}%</p>
                  <button
                    className="mt-4 bg-gray-200 px-3 py-1 rounded text-sm"
                    onClick={clearHistory}
                  >
                    Clear History
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;