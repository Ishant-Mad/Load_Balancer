import threading
import psutil
import time
import requests
import json
import uuid
import socket
from flask import Flask, request, jsonify
import multiprocessing
import os
import random

app = Flask(__name__)

# Configuration
CLOUD_ENDPOINT = "http://localhost:5111/api/metrics" 
API_KEY = "your-secret-api-key"  # Replace with your actual API key
UPDATE_INTERVAL = 2  # seconds
agent_id = str(uuid.uuid4())

# Global variables
current_algorithm = "round_robin"  # Default algorithm
cpu_count = multiprocessing.cpu_count()
active_tasks = {}
task_history = []

# Simulated workloads
def cpu_intensive_task(task_id, duration=5):
    """A CPU-intensive task that will show up in profiling."""
    thread_id = threading.get_native_id()
    process_id = os.getpid()
    
    start_time = time.time()
    result = 0
    
    # Record the start of the task
    task_info = {
        "task_id": task_id,
        "thread_id": thread_id,
        "process_id": process_id,
        "cpu_core": psutil.Process().cpu_num(),
        "start_time": start_time,
        "type": "cpu_intensive",
        "status": "running"
    }
    
    active_tasks[task_id] = task_info
    
    # CPU-intensive calculation
    while time.time() - start_time < duration:
        for i in range(10000000):
            result += i
            result *= 1.0000001
            if i % 1000000 == 0:
                time.sleep(0.001)  # Small pause to allow thread switching
    
    # Update task info
    task_info["end_time"] = time.time()
    task_info["duration"] = task_info["end_time"] - start_time
    task_info["status"] = "completed"
    
    # Move to history and remove from active tasks
    task_history.append(task_info)
    del active_tasks[task_id]
    
    return result

def io_bound_task(task_id, duration=5):
    """An I/O-bound task that primarily waits."""
    thread_id = threading.get_native_id()
    process_id = os.getpid()
    
    start_time = time.time()
    
    # Record the start of the task
    task_info = {
        "task_id": task_id,
        "thread_id": thread_id,
        "process_id": process_id,
        "cpu_core": psutil.Process().cpu_num(),
        "start_time": start_time,
        "type": "io_bound",
        "status": "running"
    }
    
    active_tasks[task_id] = task_info
    
    # Simulate I/O operations with sleep
    time.sleep(duration)
    
    # Update task info
    task_info["end_time"] = time.time()
    task_info["duration"] = task_info["end_time"] - start_time
    task_info["status"] = "completed"
    
    # Move to history and remove from active tasks
    task_history.append(task_info)
    del active_tasks[task_id]
    
    return f"Completed I/O task {task_id}"

# Load balancing algorithms
def round_robin_scheduler():
    """Simple round-robin scheduler."""
    # This is implicitly handled by the threading module
    return None

def random_scheduler():
    """Random thread scheduler (simulated)."""
    return None  # Let the OS handle it, we're just simulating different behaviors

def least_connections_scheduler():
    """Attempt to use threads with fewer active connections."""
    # In a real system, you'd assign to specific threads
    # Here we're just simulating the behavior
    return None

# API routes for the local agent
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "agent_id": agent_id,
        "cpu_count": cpu_count,
        "hostname": socket.gethostname()
    })

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get current system stats."""
    cpu_percent_per_core = psutil.cpu_percent(interval=0.5, percpu=True)
    memory = psutil.virtual_memory()
    
    return jsonify({
        "cpu_percent_per_core": cpu_percent_per_core,
        "cpu_average": sum(cpu_percent_per_core) / len(cpu_percent_per_core),
        "memory_percent": memory.percent,
        "algorithm": current_algorithm,
        "active_tasks": list(active_tasks.values()),
        "task_history": task_history[-20:],  # Last 20 tasks
        "cpu_count": cpu_count
    })

# @app.route('/stats', methods=['GET']) #by chatgpt
# def get_stats():
#     # Count tasks per core
#     core_usage = {core: 0 for core in range(cpu_count)}
#     for task in active_tasks.values():
#         core_usage[task["cpu_core"]] += 1

#     return jsonify({
#         "tasks_per_core": core_usage,  # e.g., {0: 2, 1: 1, 2: 0, 3: 1}
#         # ... other stats ...
#     })

@app.route('/run_task', methods=['POST'])
def run_task():
    """Run a new task with the current scheduling algorithm."""
    data = request.json
    task_type = data.get('type', 'cpu_intensive')
    duration = min(int(data.get('duration', 5)), 30)  # Cap at 30 seconds for safety
    
    task_id = str(uuid.uuid4())
    
    # "Apply" the selected scheduling algorithm
    global current_algorithm
    if current_algorithm == "round_robin":
        round_robin_scheduler()
    elif current_algorithm == "random":
        random_scheduler()
    elif current_algorithm == "least_connections":
        least_connections_scheduler()
    
    # Start the appropriate task in a new thread
    if task_type == "cpu_intensive":
        thread = threading.Thread(target=cpu_intensive_task, args=(task_id, duration))
    else:  # io_bound
        thread = threading.Thread(target=io_bound_task, args=(task_id, duration))
    
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "task_id": task_id,
        "status": "started",
        "type": task_type,
        "algorithm": current_algorithm
    })

@app.route('/set_algorithm', methods=['POST'])
def set_algorithm():
    """Change the current scheduling algorithm."""
    data = request.json
    algorithm = data.get('algorithm', 'round_robin')
    
    # Validate algorithm choice
    if algorithm not in ["round_robin", "random", "least_connections"]:
        return jsonify({"error": "Invalid algorithm"}), 400
    
    global current_algorithm
    current_algorithm = algorithm
    
    return jsonify({
        "algorithm": current_algorithm,
        "status": "updated"
    })

@app.route('/clear_history', methods=['POST'])
def clear_history():
    """Clear the task history."""
    global task_history
    task_history = []
    
    return jsonify({
        "status": "history cleared"
    })

# Start the server
if __name__ == '__main__':
    print(f"Starting CPU Monitor Agent on port 5111...")
    print(f"System has {cpu_count} CPU cores available")
    
    # Periodically send stats to cloud service (can be enabled by uncommenting)
    # def send_stats_to_cloud():
    #     while True:
    #         try:
    #             stats = {
    #                 "agent_id": agent_id,
    #                 "timestamp": time.time(),
    #                 "cpu_percent": psutil.cpu_percent(percpu=True),
    #                 "active_tasks": list(active_tasks.values()),
    #                 "recent_tasks": task_history[-10:] if task_history else []
    #             }
                
    #             headers = {
    #                 "Content-Type": "application/json",
    #                 "X-API-KEY": API_KEY
    #             }
                
    #             requests.post(CLOUD_ENDPOINT, json=stats, headers=headers)
    #         except Exception as e:
    #             print(f"Error sending stats to cloud: {e}")
            
    #         time.sleep(UPDATE_INTERVAL)
    
    # stats_thread = threading.Thread(target=send_stats_to_cloud)
    # stats_thread.daemon = True
    # stats_thread.start()
    
    # Start the Flask server
    app.run(host='0.0.0.0', port=5111, debug=True)