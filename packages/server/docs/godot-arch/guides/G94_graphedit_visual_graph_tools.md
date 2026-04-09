# G94 — GraphEdit & Visual Graph Tools

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md) · [G50 Advanced UI & Custom Controls](./G50_advanced_ui_custom_controls.md) · [G9 UI Control Systems](./G9_ui_control_systems.md)

Build custom visual node editors — dialogue trees, skill graphs, ability systems, shader graphs — using Godot's built-in GraphEdit and GraphNode controls. This guide covers the full workflow from basic wiring to serialization, undo/redo, and shipping as an editor plugin.

---

## Table of Contents

1. [When to Use GraphEdit](#1-when-to-use-graphedit)
2. [Core Architecture](#2-core-architecture)
3. [Setting Up a Basic Graph Editor](#3-setting-up-a-basic-graph-editor)
4. [Defining Custom Graph Nodes](#4-defining-custom-graph-nodes)
5. [Port Types and Connection Rules](#5-port-types-and-connection-rules)
6. [Handling Connections](#6-handling-connections)
7. [GraphFrame for Grouping](#7-graphframe-for-grouping)
8. [Serialization and Save/Load](#8-serialization-and-save-load)
9. [Undo/Redo Integration](#9-undoredo-integration)
10. [Context Menus and Node Creation](#10-context-menus-and-node-creation)
11. [Minimap and Navigation](#11-minimap-and-navigation)
12. [Building a Dialogue Tree Editor](#12-building-a-dialogue-tree-editor)
13. [Runtime Graph Evaluation](#13-runtime-graph-evaluation)
14. [Packaging as an Editor Plugin](#14-packaging-as-an-editor-plugin)
15. [Performance Considerations](#15-performance-considerations)
16. [Common Mistakes](#16-common-mistakes)

---

## 1. When to Use GraphEdit

GraphEdit is Godot's built-in control for displaying and editing node-and-wire graphs. It handles panning, zooming, selection, snapping, and connection drawing out of the box. You provide the nodes; it provides the canvas.

**Good fits:** dialogue trees, skill/tech trees, quest flow editors, visual state machines, ability graphs, shader prototyping tools, audio routing, procedural generation pipelines.

**Poor fits:** simple lists (use ItemList/Tree), spatial editors (use SubViewport with 2D/3D), or flowcharts that need non-port connections (GraphEdit only supports port-to-port wiring).

---

## 2. Core Architecture

GraphEdit uses three main classes:

- **GraphEdit** — the scrollable, zoomable canvas. Manages connections, snapping, grid, minimap.
- **GraphNode** — a draggable card placed inside GraphEdit. Contains child controls (labels, buttons, line edits) and exposes typed **ports** (slots) on its left and right edges.
- **GraphFrame** (4.4+) — a visual grouping rectangle that can contain GraphNodes for organizational purposes.

Connections are stored by GraphEdit as a list of dictionaries. Each connection records `from_node` (StringName), `from_port` (int), `to_node` (StringName), `to_port` (int).

---

## 3. Setting Up a Basic Graph Editor

### GDScript

```gdscript
# graph_editor.gd — attach to a Control node in your scene
extends Control

@onready var graph: GraphEdit = $GraphEdit

func _ready() -> void:
    # Configure the canvas
    graph.snapping_enabled = true
    graph.snapping_distance = 20
    graph.minimap_enabled = true
    graph.show_arrange_button = true

    # Listen for connection events
    graph.connection_request.connect(_on_connection_request)
    graph.disconnection_request.connect(_on_disconnection_request)

    # Add a starter node
    _add_node("Start", Vector2(100, 100))

func _on_connection_request(
    from_node: StringName, from_port: int,
    to_node: StringName, to_port: int
) -> void:
    graph.connect_node(from_node, from_port, to_node, to_port)

func _on_disconnection_request(
    from_node: StringName, from_port: int,
    to_node: StringName, to_port: int
) -> void:
    graph.disconnect_node(from_node, from_port, to_node, to_port)

func _add_node(title: String, offset: Vector2) -> GraphNode:
    var node := GraphNode.new()
    node.title = title
    node.name = _unique_name(title)
    node.position_offset = offset

    # Add a label as the first slot (index 0)
    var label := Label.new()
    label.text = "Output"
    node.add_child(label)

    # Enable an output port on slot 0
    # set_slot(idx, left_enabled, left_type, left_color,
    #          right_enabled, right_type, right_color)
    node.set_slot(0, false, 0, Color.WHITE, true, 0, Color.CYAN)

    graph.add_child(node)
    return node

var _name_counter: int = 0
func _unique_name(base: String) -> String:
    _name_counter += 1
    return "%s_%d" % [base, _name_counter]
```

### C#

```csharp
using Godot;

public partial class GraphEditorPanel : Control
{
    private GraphEdit _graph;
    private int _nameCounter;

    public override void _Ready()
    {
        _graph = GetNode<GraphEdit>("GraphEdit");
        _graph.SnappingEnabled = true;
        _graph.SnappingDistance = 20;
        _graph.MinimapEnabled = true;

        _graph.ConnectionRequest += OnConnectionRequest;
        _graph.DisconnectionRequest += OnDisconnectionRequest;

        AddGraphNode("Start", new Vector2(100, 100));
    }

    private void OnConnectionRequest(
        StringName fromNode, int fromPort,
        StringName toNode, int toPort)
    {
        _graph.ConnectNode(fromNode, fromPort, toNode, toPort);
    }

    private void OnDisconnectionRequest(
        StringName fromNode, int fromPort,
        StringName toNode, int toPort)
    {
        _graph.DisconnectNode(fromNode, fromPort, toNode, toPort);
    }

    private GraphNode AddGraphNode(string title, Vector2 offset)
    {
        var node = new GraphNode
        {
            Title = title,
            Name = UniqueName(title),
            PositionOffset = offset
        };

        var label = new Label { Text = "Output" };
        node.AddChild(label);
        node.SetSlot(0, false, 0, Colors.White, true, 0, Colors.Cyan);

        _graph.AddChild(node);
        return node;
    }

    private string UniqueName(string baseName) =>
        $"{baseName}_{++_nameCounter}";
}
```

---

## 4. Defining Custom Graph Nodes

Each child Control of a GraphNode becomes a **slot**. Slots are indexed top-to-bottom (0, 1, 2…). Each slot can have a left port (input), a right port (output), or both.

### GDScript — Multi-Slot Node

```gdscript
# dialogue_graph_node.gd
class_name DialogueGraphNode
extends GraphNode

# Port type constants — you define these, they control which ports connect
const PORT_FLOW: int = 0      # execution flow
const PORT_CONDITION: int = 1  # boolean condition

func _init() -> void:
    title = "Dialogue"
    resizable = true

func setup(speaker: String, text: String) -> void:
    # Slot 0: Flow input + output
    var flow_label := Label.new()
    flow_label.text = "Flow"
    add_child(flow_label)
    set_slot(0,
        true, PORT_FLOW, Color.WHITE,   # left: flow in
        true, PORT_FLOW, Color.WHITE)   # right: flow out

    # Slot 1: Speaker name (no ports, just UI)
    var speaker_edit := LineEdit.new()
    speaker_edit.text = speaker
    speaker_edit.placeholder_text = "Speaker"
    add_child(speaker_edit)
    set_slot(1, false, 0, Color.WHITE, false, 0, Color.WHITE)

    # Slot 2: Dialogue text (no ports)
    var text_edit := TextEdit.new()
    text_edit.text = text
    text_edit.custom_minimum_size = Vector2(200, 80)
    add_child(text_edit)
    set_slot(2, false, 0, Color.WHITE, false, 0, Color.WHITE)

    # Slot 3: Condition input
    var cond_label := Label.new()
    cond_label.text = "Condition"
    add_child(cond_label)
    set_slot(3,
        true, PORT_CONDITION, Color.YELLOW,  # left: condition in
        false, 0, Color.WHITE)                # no right port
```

### C# — Multi-Slot Node

```csharp
using Godot;

[GlobalClass]
public partial class DialogueGraphNode : GraphNode
{
    public const int PortFlow = 0;
    public const int PortCondition = 1;

    public void Setup(string speaker, string text)
    {
        Title = "Dialogue";
        Resizable = true;

        // Slot 0: Flow in/out
        var flowLabel = new Label { Text = "Flow" };
        AddChild(flowLabel);
        SetSlot(0, true, PortFlow, Colors.White,
                   true, PortFlow, Colors.White);

        // Slot 1: Speaker (no ports)
        var speakerEdit = new LineEdit
        {
            Text = speaker,
            PlaceholderText = "Speaker"
        };
        AddChild(speakerEdit);
        SetSlot(1, false, 0, Colors.White, false, 0, Colors.White);

        // Slot 2: Text (no ports)
        var textEdit = new TextEdit
        {
            Text = text,
            CustomMinimumSize = new Vector2(200, 80)
        };
        AddChild(textEdit);
        SetSlot(2, false, 0, Colors.White, false, 0, Colors.White);

        // Slot 3: Condition input only
        var condLabel = new Label { Text = "Condition" };
        AddChild(condLabel);
        SetSlot(3, true, PortCondition, Colors.Yellow,
                   false, 0, Colors.White);
    }
}
```

---

## 5. Port Types and Connection Rules

Port types are integers you define. GraphEdit only allows connections between ports that share the **same type value**. This lets you enforce type safety visually:

```gdscript
# Define your type system
const PORT_FLOW: int = 0        # white wires
const PORT_STRING: int = 1      # green wires
const PORT_NUMBER: int = 2      # blue wires
const PORT_BOOLEAN: int = 3     # yellow wires

# Users can connect PORT_FLOW → PORT_FLOW but not PORT_FLOW → PORT_STRING
```

To allow **any-to-any** connections on specific ports, use `GraphEdit.add_valid_connection_type()`:

```gdscript
# Allow number ports to connect to string ports (implicit conversion)
graph.add_valid_connection_type(PORT_NUMBER, PORT_STRING)
```

To allow a single output to connect to multiple inputs (fan-out) or a single input to accept multiple outputs (fan-in), that is the default behavior. To restrict to **one connection per port**, handle it in `_on_connection_request`:

```gdscript
func _on_connection_request(
    from_node: StringName, from_port: int,
    to_node: StringName, to_port: int
) -> void:
    # Enforce single-input: disconnect any existing connection to this input
    for conn: Dictionary in graph.get_connection_list():
        if conn.to_node == to_node and conn.to_port == to_port:
            graph.disconnect_node(
                conn.from_node, conn.from_port,
                conn.to_node, conn.to_port)
    graph.connect_node(from_node, from_port, to_node, to_port)
```

---

## 6. Handling Connections

GraphEdit emits these signals for connection management:

| Signal | When |
|--------|------|
| `connection_request` | User drags a wire and releases on a valid port |
| `disconnection_request` | User drags an existing wire off a port (requires `right_disconnects = true`) |
| `connection_to_empty` | User releases a wire on empty space (use for auto-create menus) |
| `connection_from_empty` | User drags from empty space to a port |
| `delete_nodes_request` | User presses Delete with nodes selected |

### Reacting to Deletion

```gdscript
func _ready() -> void:
    graph.delete_nodes_request.connect(_on_delete_nodes)

func _on_delete_nodes(nodes: Array[StringName]) -> void:
    for node_name: StringName in nodes:
        var node: GraphNode = graph.get_node(NodePath(node_name))
        if node == null:
            continue
        # Remove all connections involving this node
        for conn: Dictionary in graph.get_connection_list():
            if conn.from_node == node_name or conn.to_node == node_name:
                graph.disconnect_node(
                    conn.from_node, conn.from_port,
                    conn.to_node, conn.to_port)
        node.queue_free()
```

---

## 7. GraphFrame for Grouping

Godot 4.4 introduced **GraphFrame** — a visual rectangle that groups GraphNodes. Frames help organize complex graphs (e.g., grouping all nodes in a dialogue branch).

```gdscript
func _add_frame(title: String, offset: Vector2) -> GraphFrame:
    var frame := GraphFrame.new()
    frame.title = title
    frame.name = _unique_name("Frame")
    frame.position_offset = offset
    frame.size = Vector2(400, 300)
    graph.add_child(frame)
    return frame

# Attach a node to a frame
func _attach_to_frame(node: GraphNode, frame: GraphFrame) -> void:
    graph.attach_graph_element_to_frame(node.name, frame.name)
```

Frames are purely visual — they don't affect connection logic or evaluation order.

---

## 8. Serialization and Save/Load

GraphEdit doesn't serialize itself. You must save node data and connections to a Resource or JSON file.

### GDScript — Resource-Based Serialization

```gdscript
# graph_data.gd — Custom Resource for storing graph state
class_name GraphData
extends Resource

@export var nodes: Array[Dictionary] = []
@export var connections: Array[Dictionary] = []

static func capture(graph: GraphEdit) -> GraphData:
    var data := GraphData.new()

    # Save nodes
    for child: Node in graph.get_children():
        if child is GraphNode:
            var node_data: Dictionary[String, Variant] = {
                "name": child.name,
                "title": child.title,
                "offset_x": child.position_offset.x,
                "offset_y": child.position_offset.y,
                # Add your custom data here
            }
            # Capture editable fields
            for slot_child: Node in child.get_children():
                if slot_child is LineEdit:
                    node_data["speaker"] = slot_child.text
                elif slot_child is TextEdit:
                    node_data["dialogue"] = slot_child.text
            data.nodes.append(node_data)

    # Save connections
    data.connections = graph.get_connection_list()
    return data

func restore(graph: GraphEdit, node_factory: Callable) -> void:
    # Clear existing
    for child: Node in graph.get_children():
        if child is GraphNode:
            child.queue_free()

    # Rebuild nodes
    for node_data: Dictionary in nodes:
        node_factory.call(graph, node_data)

    # Rebuild connections (deferred so nodes exist)
    graph.get_tree().process_frame.connect(
        func() -> void:
            for conn: Dictionary in connections:
                graph.connect_node(
                    conn.from_node, conn.from_port,
                    conn.to_node, conn.to_port),
        CONNECT_ONE_SHOT)
```

### Saving / Loading

```gdscript
func _save_graph() -> void:
    var data: GraphData = GraphData.capture(graph)
    ResourceSaver.save(data, "res://dialogue_graph.tres")

func _load_graph() -> void:
    var data: GraphData = load("res://dialogue_graph.tres") as GraphData
    if data:
        data.restore(graph, _create_node_from_data)
```

---

## 9. Undo/Redo Integration

When building an **editor plugin**, integrate with Godot's `EditorUndoRedoManager` for proper undo/redo:

```gdscript
# Inside your EditorPlugin subclass
var undo_redo: EditorUndoRedoManager

func _on_connection_request(
    from_node: StringName, from_port: int,
    to_node: StringName, to_port: int
) -> void:
    undo_redo.create_action("Connect Nodes")
    undo_redo.add_do_method(graph, "connect_node",
        from_node, from_port, to_node, to_port)
    undo_redo.add_undo_method(graph, "disconnect_node",
        from_node, from_port, to_node, to_port)
    undo_redo.commit_action()
```

---

## 10. Context Menus and Node Creation

Use `connection_to_empty` to spawn a context menu where the user can pick which node type to create:

```gdscript
func _ready() -> void:
    graph.connection_to_empty.connect(_on_connection_to_empty)

func _on_connection_to_empty(
    from_node: StringName, from_port: int,
    release_position: Vector2
) -> void:
    # Show a popup menu at the release position
    var popup := PopupMenu.new()
    popup.add_item("Dialogue Node", 0)
    popup.add_item("Choice Node", 1)
    popup.add_item("Condition Node", 2)
    popup.position = get_viewport().get_mouse_position()
    add_child(popup)
    popup.popup()

    popup.id_pressed.connect(
        func(id: int) -> void:
            # Convert screen position to graph position
            var graph_pos: Vector2 = (
                release_position + graph.scroll_offset
            ) / graph.zoom
            var new_node: GraphNode = _create_node_by_type(id, graph_pos)
            # Auto-connect the wire
            graph.connect_node(from_node, from_port, new_node.name, 0)
            popup.queue_free())
```

---

## 11. Minimap and Navigation

GraphEdit has a built-in minimap toggled via `minimap_enabled`. Additional navigation helpers:

```gdscript
# Zoom to fit all nodes
func _zoom_to_fit() -> void:
    # GraphEdit doesn't have a built-in fit method, so calculate manually
    var rect := Rect2()
    var first := true
    for child: Node in graph.get_children():
        if child is GraphNode:
            var node_rect := Rect2(child.position_offset, child.size)
            if first:
                rect = node_rect
                first = false
            else:
                rect = rect.merge(node_rect)
    if not first:
        # Add padding
        rect = rect.grow(100.0)
        graph.scroll_offset = rect.position * graph.zoom
```

---

## 12. Building a Dialogue Tree Editor

Putting it all together — a minimal dialogue tree editor with Start, Dialogue, and Choice nodes:

```gdscript
# dialogue_editor.gd
extends Control

@onready var graph: GraphEdit = $GraphEdit

const PORT_FLOW: int = 0

func _ready() -> void:
    graph.connection_request.connect(_on_connect)
    graph.disconnection_request.connect(_on_disconnect)
    graph.right_disconnects = true

    # Add a start node (output only)
    var start: GraphNode = _make_node("Start", Vector2(50, 150))
    var start_label := Label.new()
    start_label.text = "Begin"
    start.add_child(start_label)
    start.set_slot(0, false, 0, Color.WHITE, true, PORT_FLOW, Color.GREEN)

func _make_node(title: String, offset: Vector2) -> GraphNode:
    var node := GraphNode.new()
    node.title = title
    node.name = _unique_name(title)
    node.position_offset = offset
    graph.add_child(node)
    return node

func add_dialogue_node(offset: Vector2) -> GraphNode:
    var node: GraphNode = _make_node("Dialogue", offset)

    # Slot 0: Flow in/out
    var flow := Label.new()
    flow.text = "→"
    node.add_child(flow)
    node.set_slot(0, true, PORT_FLOW, Color.GREEN,
                     true, PORT_FLOW, Color.GREEN)

    # Slot 1: Speaker
    var speaker := LineEdit.new()
    speaker.placeholder_text = "Speaker name"
    node.add_child(speaker)

    # Slot 2: Text
    var text := TextEdit.new()
    text.placeholder_text = "Dialogue text..."
    text.custom_minimum_size = Vector2(250, 60)
    node.add_child(text)

    return node

func add_choice_node(offset: Vector2, choices: int = 2) -> GraphNode:
    var node: GraphNode = _make_node("Choice", offset)

    # Slot 0: Flow in (no output — outputs come from choice slots)
    var flow := Label.new()
    flow.text = "Prompt"
    node.add_child(flow)
    node.set_slot(0, true, PORT_FLOW, Color.GREEN,
                     false, 0, Color.WHITE)

    # One output port per choice option
    for i: int in range(choices):
        var choice_edit := LineEdit.new()
        choice_edit.placeholder_text = "Choice %d" % (i + 1)
        node.add_child(choice_edit)
        node.set_slot(i + 1, false, 0, Color.WHITE,
                          true, PORT_FLOW, Color.ORANGE)

    return node

func _on_connect(fn: StringName, fp: int, tn: StringName, tp: int) -> void:
    graph.connect_node(fn, fp, tn, tp)

func _on_disconnect(fn: StringName, fp: int, tn: StringName, tp: int) -> void:
    graph.disconnect_node(fn, fp, tn, tp)

var _counter: int = 0
func _unique_name(base: String) -> String:
    _counter += 1
    return "%s_%d" % [base, _counter]
```

---

## 13. Runtime Graph Evaluation

At runtime, walk the graph by following connections from a start node:

```gdscript
# dialogue_runner.gd — evaluates a saved GraphData at runtime
class_name DialogueRunner
extends RefCounted

var graph_data: GraphData
var _adjacency: Dictionary[String, Array] = {}  # node_name -> [{port, target, target_port}]

func load_graph(data: GraphData) -> void:
    graph_data = data
    _build_adjacency()

func _build_adjacency() -> void:
    _adjacency.clear()
    for conn: Dictionary in graph_data.connections:
        var from_name: String = conn.from_node
        if not _adjacency.has(from_name):
            _adjacency[from_name] = []
        _adjacency[from_name].append({
            "port": conn.from_port,
            "target": conn.to_node,
            "target_port": conn.to_port,
        })

func get_next_nodes(current_name: String, from_port: int = 0) -> Array:
    if not _adjacency.has(current_name):
        return []
    var results: Array = []
    for edge: Dictionary in _adjacency[current_name]:
        if edge.port == from_port:
            results.append(edge.target)
    return results

func find_start_node() -> String:
    for node_data: Dictionary in graph_data.nodes:
        if node_data.title == "Start":
            return node_data.name
    return ""
```

### C# — Graph Evaluation

```csharp
using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class DialogueRunner : RefCounted
{
    private readonly Dictionary<string, List<(int Port, string Target)>> _adjacency = new();

    public void LoadGraph(Godot.Collections.Array<Godot.Collections.Dictionary> connections)
    {
        _adjacency.Clear();
        foreach (var conn in connections)
        {
            string fromName = conn["from_node"].AsStringName();
            int fromPort = conn["from_port"].AsInt32();
            string toName = conn["to_node"].AsStringName();

            if (!_adjacency.ContainsKey(fromName))
                _adjacency[fromName] = new List<(int, string)>();

            _adjacency[fromName].Add((fromPort, toName));
        }
    }

    public List<string> GetNextNodes(string currentName, int fromPort = 0)
    {
        if (!_adjacency.TryGetValue(currentName, out var edges))
            return new List<string>();

        return edges
            .Where(e => e.Port == fromPort)
            .Select(e => e.Target)
            .ToList();
    }
}
```

---

## 14. Packaging as an Editor Plugin

To ship your graph editor as a Godot editor plugin:

```
addons/
  my_dialogue_editor/
    plugin.cfg
    plugin.gd
    dialogue_editor.tscn    # your GraphEdit scene
    dialogue_editor.gd
    nodes/
      dialogue_graph_node.gd
      choice_graph_node.gd
```

```ini
; plugin.cfg
[plugin]
name="Dialogue Graph Editor"
description="Visual dialogue tree editor"
author="YourName"
version="1.0.0"
script="plugin.gd"
```

```gdscript
# plugin.gd
@tool
extends EditorPlugin

var editor_instance: Control

func _enter_tree() -> void:
    editor_instance = preload("res://addons/my_dialogue_editor/dialogue_editor.tscn").instantiate()
    # Add as a bottom panel tab
    add_control_to_bottom_panel(editor_instance, "Dialogue")

func _exit_tree() -> void:
    remove_control_from_bottom_panel(editor_instance)
    if editor_instance:
        editor_instance.queue_free()
```

---

## 15. Performance Considerations

- **Node count:** GraphEdit handles hundreds of nodes well. Above ~500 visible nodes, consider pagination or level-of-detail (collapse distant groups).
- **Connection drawing:** Each visible connection is a draw call. Hide off-screen connections by leveraging GraphEdit's built-in culling.
- **Slot updates:** Calling `set_slot()` triggers a redraw. Batch slot changes before adding a node to the graph.
- **GraphFrame:** Frames with many attached nodes incur layout costs when dragged. Keep frame sizes reasonable.

---

## 16. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to connect `connection_request` signal | Nothing happens when users drag wires. Always connect both `connection_request` and `disconnection_request`. |
| Port type mismatch | Connections silently fail if port types don't match. Double-check `set_slot()` type integers. |
| Using `node.position` instead of `node.position_offset` | `position_offset` is the graph-space coordinate. `position` is the Control layout position and should not be set manually. |
| Not setting unique `name` on GraphNodes | GraphEdit uses `name` as the node identifier in connections. Duplicate names cause broken wires. |
| Serializing node references directly | Save `node.name` strings, not object references. Rebuild connections by name after loading. |
| Adding GraphNodes before connecting signals | Nodes added in `_ready()` before signals are connected won't trigger connection events. Connect signals first. |
