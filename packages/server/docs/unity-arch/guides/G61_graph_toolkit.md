# G61 — Graph Toolkit: Custom Node-Based Editor Tools

> **Category:** guide · **Engine:** Unity 6.2+ (6000.x) · **Related:** [G32 Editor Scripting & Custom Tools](G32_editor_scripting_custom_tools.md) · [G15 Shader Graph & VFX Graph](G15_shader_graph_vfx_graph.md) · [G59 Visual Scripting](G59_visual_scripting.md) · [Unity Rules](../unity-arch-rules.md)

Unity Graph Toolkit (`com.unity.graphtoolkit`, experimental in 6.2, module in 6.4+) is a framework for building **custom node-based editor tools**. It provides the UI infrastructure — node rendering, wire connections, undo/redo, serialization, minimap, blackboard, inspector — so you focus on domain-specific logic. Use it to build dialogue trees, quest editors, ability graphs, procedural generation pipelines, or any tool where visual node graphs are the right authoring paradigm.

> **Important distinction:** Graph Toolkit is an **editor-time authoring framework**. It does NOT provide a runtime execution engine. You define what nodes mean, how they serialize, and how your game consumes the authored data. Think of it as the "frontend" for your custom graph — you build the "backend."

---

## When to Use Graph Toolkit

| Scenario | Graph Toolkit | Alternative |
|----------|:---:|---|
| Custom dialogue tree editor | ✅ | |
| Quest / mission graph editor | ✅ | |
| Ability / skill tree authoring | ✅ | |
| Procedural generation pipeline editor | ✅ | |
| Shader authoring | | Shader Graph (built on Graph Toolkit internally) |
| Visual effects authoring | | VFX Graph |
| General gameplay scripting by designers | | Visual Scripting (see G59) |
| Simple inspector-based configuration | | Custom PropertyDrawer or EditorWindow |

**Rule of thumb:** if your data is a **directed graph** (nodes with typed connections) and non-programmers need to author it, Graph Toolkit saves months of UI development compared to building from scratch with UI Toolkit or the legacy GraphView API.

---

## Graph Toolkit vs. Legacy GraphView

Graph Toolkit replaces the older `UnityEditor.Experimental.GraphView` API. Key differences:

| Feature | Legacy GraphView | Graph Toolkit |
|---------|:---:|:---:|
| Built on | IMGUI + UIElements hybrid | Pure UI Toolkit |
| Serialization | Manual (you build it) | Built-in (Graph asset system) |
| Undo/Redo | Manual | Built-in |
| Minimap | Basic | Full-featured |
| Blackboard (variables) | Manual | Built-in |
| Inspector panel | Manual | Built-in |
| Subgraph support | Manual | Built-in |
| Missing node handling | Crash or silent loss | Graceful degradation |
| Unity's investment | Deprecated | Active development |

> **Migration:** If you have existing GraphView-based tools, plan a migration to Graph Toolkit. GraphView will not receive new features and may be removed in a future Unity version.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Graph Toolkit                       │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Graph      │  │  Node        │  │  Wire       │  │
│  │  (asset)    │──│  (data)      │──│  (connect)  │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│         │                │                           │
│  ┌──────┴──────┐  ┌──────┴──────┐                   │
│  │ Blackboard  │  │   Ports     │                   │
│  │ (variables) │  │ (in / out)  │                   │
│  └─────────────┘  └─────────────┘                   │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │             UI Layer (automatic)               │  │
│  │  Graph Window · Inspector · Minimap · Search   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
         │
         ▼  (your code)
┌──────────────────────────────────────────────────────┐
│              Your Runtime Interpreter                 │
│  Reads serialized graph data → executes game logic   │
└──────────────────────────────────────────────────────┘
```

**You define:**
- A `Graph` subclass (the asset type, stored as a file)
- `Node` subclasses (the operations / data points in your graph)
- Port definitions on each node (typed inputs and outputs)
- Runtime interpretation logic (how your game reads and executes the graph)

**Graph Toolkit provides:**
- The editor window with pan/zoom, selection, copy/paste
- Wire drawing and connection validation
- Serialization to/from disk
- Undo/redo for all graph mutations
- Blackboard for graph-level variables
- Inspector for selected node properties
- Subgraph nesting
- Graceful handling of missing/renamed node types

---

## Getting Started: A Minimal Custom Graph

### Step 1: Assembly Definition

Graph Toolkit code is **editor-only**. Create an Editor assembly definition:

```json
// Editor/com.yourcompany.dialoguegraph.editor.asmdef
{
    "name": "YourCompany.DialogueGraph.Editor",
    "rootNamespace": "YourCompany.DialogueGraph.Editor",
    "references": [
        "Unity.GraphToolkit.Editor",
        "Unity.GraphToolkit.Common.Editor"
    ],
    "includePlatforms": [
        "Editor"
    ],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": false,
    "precompiledReferences": [],
    "autoReferenced": true,
    "defineConstraints": [],
    "versionDefines": [],
    "noEngineReferences": false
}
```

### Step 2: Define the Graph Asset

```csharp
using System;
using UnityEditor;
using Unity.GraphToolkit.Editor;

namespace YourCompany.DialogueGraph.Editor
{
    // WHY: The [Graph] attribute registers this class as a graph asset type.
    // The AssetExtension defines the file extension for graph assets on disk.
    // Unity will associate this extension with your graph editor window.

    [Graph(AssetExtension)]
    [Serializable]
    class DialogueGraph : Graph
    {
        // File extension for dialogue graph assets (e.g., "MyDialogue.dialogue")
        public const string AssetExtension = "dialogue";

        // WHY: This menu item lets users create new dialogue graphs
        // from the Project window, just like creating a new Material or Script.
        [MenuItem("Assets/Create/Dialogue/Dialogue Graph", false)]
        static void CreateAssetFile()
        {
            GraphDatabase.PromptInProjectBrowserToCreateNewAsset<DialogueGraph>();
        }
    }
}
```

After compiling, users can right-click in the Project window → Create → Dialogue → Dialogue Graph to create a `.dialogue` asset. Double-clicking the asset opens the graph editor window automatically.

### Step 3: Define Custom Nodes

```csharp
using System;
using Unity.GraphToolkit.Editor;

namespace YourCompany.DialogueGraph.Editor
{
    // WHY: Each node type is a [Serializable] class inheriting from Node.
    // Graph Toolkit auto-discovers all Node subclasses in the same assembly
    // as your Graph class — no manual registration needed.

    /// <summary>
    /// A dialogue line spoken by a character.
    /// </summary>
    [Serializable]
    class DialogueLineNode : Node
    {
        // WHY: Serialized fields appear in the Graph Inspector when
        // the node is selected, just like MonoBehaviour fields.
        [UnityEngine.SerializeField]
        private string _speakerName = "Character";

        [UnityEngine.SerializeField]
        [UnityEngine.TextArea(3, 8)]
        private string _dialogueText = "Hello, adventurer!";

        [UnityEngine.SerializeField]
        private float _displayDuration = 3.0f;

        // WHY: OnDefinePorts declares what connections this node accepts.
        // Input ports receive data/flow from other nodes.
        // Output ports send data/flow to other nodes.
        protected override void OnDefinePorts(IPortDefinitionContext context)
        {
            // Flow input: previous node connects here to trigger this dialogue
            context.AddInputPort<DialogueFlow>("In").Build();

            // Flow output: connect to the next node in the conversation
            context.AddOutputPort<DialogueFlow>("Out").Build();
        }
    }

    /// <summary>
    /// A branching choice point where the player picks a response.
    /// </summary>
    [Serializable]
    class ChoiceNode : Node
    {
        [UnityEngine.SerializeField]
        private string _promptText = "What do you say?";

        [UnityEngine.SerializeField]
        private string[] _choices = new[] { "Option A", "Option B" };

        protected override void OnDefinePorts(IPortDefinitionContext context)
        {
            // Single input for the incoming conversation flow
            context.AddInputPort<DialogueFlow>("In").Build();

            // WHY: One output port per choice. When the player picks
            // "Option A", the runtime follows the wire from "Choice 0".
            // Dynamic port count based on the choices array.
            for (int i = 0; i < _choices.Length; i++)
            {
                context.AddOutputPort<DialogueFlow>($"Choice {i}").Build();
            }
        }
    }

    /// <summary>
    /// A condition that checks a game variable before proceeding.
    /// </summary>
    [Serializable]
    class ConditionNode : Node
    {
        [UnityEngine.SerializeField]
        private string _variableName = "hasKey";

        [UnityEngine.SerializeField]
        private ComparisonOp _comparison = ComparisonOp.Equals;

        [UnityEngine.SerializeField]
        private int _value = 1;

        protected override void OnDefinePorts(IPortDefinitionContext context)
        {
            context.AddInputPort<DialogueFlow>("In").Build();

            // WHY: Two outputs for branching — "True" and "False".
            // The runtime evaluates the condition and follows the
            // appropriate wire.
            context.AddOutputPort<DialogueFlow>("True").Build();
            context.AddOutputPort<DialogueFlow>("False").Build();
        }
    }

    /// <summary>
    /// Start node — marks the entry point of a conversation.
    /// </summary>
    [Serializable]
    class StartNode : Node
    {
        protected override void OnDefinePorts(IPortDefinitionContext context)
        {
            // WHY: No input port — this is always the first node.
            context.AddOutputPort<DialogueFlow>("Start").Build();
        }
    }

    // WHY: Custom port types enable type-safe connections.
    // Graph Toolkit only allows wires between ports of compatible types.
    // This prevents users from connecting a "dialogue flow" output
    // to an "integer data" input.
    [Serializable]
    struct DialogueFlow { }

    enum ComparisonOp
    {
        Equals,
        NotEquals,
        GreaterThan,
        LessThan
    }
}
```

### Step 4: Runtime Interpretation (Your Responsibility)

Graph Toolkit does not execute graphs at runtime — you write the interpreter. A typical approach:

```csharp
using UnityEngine;

namespace YourCompany.DialogueGraph.Runtime
{
    // WHY: This runtime class reads the serialized graph data and
    // walks the node connections to drive dialogue in your game.
    // It lives in a Runtime assembly, separate from the Editor code.

    /// <summary>
    /// Walks a serialized dialogue graph at runtime.
    /// The graph data is exported from the editor as a ScriptableObject
    /// or JSON asset — NOT the raw Graph Toolkit asset (which is editor-only).
    /// </summary>
    public class DialogueRunner : MonoBehaviour
    {
        [SerializeField] private DialogueData _dialogueData;

        private int _currentNodeIndex;

        public void StartDialogue()
        {
            // Find the StartNode and begin traversal
            _currentNodeIndex = _dialogueData.FindStartNode();
            ProcessCurrentNode();
        }

        private void ProcessCurrentNode()
        {
            var node = _dialogueData.Nodes[_currentNodeIndex];

            switch (node.Type)
            {
                case NodeType.DialogueLine:
                    // WHY: Display the dialogue text in your UI system.
                    // When the player advances, follow the "Out" connection.
                    ShowDialogue(node.SpeakerName, node.Text, () =>
                    {
                        _currentNodeIndex = node.Connections[0];
                        ProcessCurrentNode();
                    });
                    break;

                case NodeType.Choice:
                    // WHY: Present choices to the player. Each choice
                    // index maps to a connection in the serialized data.
                    ShowChoices(node.Choices, choiceIndex =>
                    {
                        _currentNodeIndex = node.Connections[choiceIndex];
                        ProcessCurrentNode();
                    });
                    break;

                case NodeType.Condition:
                    // WHY: Evaluate the condition against game state
                    // and follow the True or False branch.
                    bool result = EvaluateCondition(node);
                    _currentNodeIndex = result
                        ? node.Connections[0]   // True branch
                        : node.Connections[1];  // False branch
                    ProcessCurrentNode();
                    break;

                case NodeType.End:
                    EndDialogue();
                    break;
            }
        }

        private void ShowDialogue(string speaker, string text,
            System.Action onComplete)
        {
            // Your UI implementation here
            Debug.Log($"{speaker}: {text}");
            // Call onComplete when player advances
        }

        private void ShowChoices(string[] choices,
            System.Action<int> onChoice)
        {
            // Your choice UI implementation here
            for (int i = 0; i < choices.Length; i++)
                Debug.Log($"  [{i}] {choices[i]}");
        }

        private bool EvaluateCondition(NodeData node)
        {
            // Check against your game state system
            // e.g., GameState.GetInt(node.VariableName) == node.CompareValue
            return true;
        }

        private void EndDialogue()
        {
            Debug.Log("Dialogue ended.");
        }
    }

    // WHY: Serializable data classes that mirror your editor nodes
    // but are lightweight and runtime-safe (no editor dependencies).
    [System.Serializable]
    public class DialogueData : ScriptableObject
    {
        public NodeData[] Nodes;

        public int FindStartNode()
        {
            for (int i = 0; i < Nodes.Length; i++)
                if (Nodes[i].Type == NodeType.Start) return i;
            return 0;
        }
    }

    [System.Serializable]
    public class NodeData
    {
        public NodeType Type;
        public string SpeakerName;
        public string Text;
        public string[] Choices;
        public string VariableName;
        public int CompareValue;
        public int[] Connections; // Indices into the Nodes array
    }

    public enum NodeType
    {
        Start, DialogueLine, Choice, Condition, End
    }
}
```

---

## Built-In Features You Get for Free

Once your Graph and Node classes compile, Graph Toolkit automatically provides:

### Blackboard (Graph Variables)
A side panel where users define variables scoped to the graph. Variables can be dragged onto the graph canvas as Get/Set nodes. Use these for dialogue flags, counters, or any graph-scoped state.

### Inspector Panel
When a node is selected, its `[SerializeField]` fields appear in the Inspector panel using standard Unity property drawers. Custom PropertyDrawers work too.

### Minimap
A thumbnail view of the entire graph for navigation in large graphs.

### Search / Fuzzy Finder
Press Space or right-click the canvas to open the node search menu. All `Node` subclasses in the assembly appear automatically, organized by namespace.

### Subgraphs
Nodes can reference other graph assets, enabling hierarchical composition. Use this for reusable dialogue fragments or shared quest logic.

### Undo/Redo
All graph mutations (add/remove/move nodes, create/delete wires, edit properties) are tracked in Unity's undo system automatically.

### Copy/Paste
Nodes and wires can be copied within or across graph windows.

### Missing Node Recovery
If a node class is renamed or removed, Graph Toolkit preserves the serialized data and shows a placeholder instead of crashing. Re-adding or renaming the class recovers the node.

---

## Export Pipeline: Editor → Runtime

Since Graph Toolkit is editor-only, you need an export step to make graph data available at runtime:

```
┌─────────────────┐    Build/Export    ┌──────────────────┐
│  .dialogue      │ ─────────────────▶ │ DialogueData     │
│  (Graph Toolkit │    (your custom    │ (ScriptableObject│
│   editor asset) │     exporter)      │  or JSON asset)  │
└─────────────────┘                    └──────────────────┘
                                              │
                                              ▼
                                       ┌──────────────────┐
                                       │ DialogueRunner   │
                                       │ (MonoBehaviour   │
                                       │  runtime logic)  │
                                       └──────────────────┘
```

**Export approaches:**

1. **ScriptableObject exporter** — an Editor script that reads the Graph Toolkit asset, walks its nodes and wires, and generates a lightweight `ScriptableObject` containing only the data your runtime needs
2. **JSON/Binary export** — serialize to a custom format in `StreamingAssets/` or Addressables
3. **Source generator** — for advanced cases, generate C# code from the graph at build time

> **WHY not use the graph asset directly at runtime?** Graph Toolkit classes live in editor assemblies (`Unity.GraphToolkit.Editor`). They are stripped from builds. Your runtime data format should have zero editor dependencies.

---

## Performance and Scalability

Graph Toolkit uses UI Toolkit under the hood, which means:

- **Large graphs (1000+ nodes)** render efficiently via UI Toolkit's retained-mode renderer
- **Serialization** handles large graphs without custom chunking
- **The editor window** supports multiple graph tabs

**Tips for large graphs:**
- Use subgraphs to break complex logic into manageable pieces
- Color-code node categories for visual clarity (override node styling)
- Use the Blackboard for shared state instead of long wire chains
- Profile editor performance with the Unity Profiler if you notice lag

---

## Common Pitfalls

1. **Forgetting assembly references** — your Editor asmdef must reference `Unity.GraphToolkit.Editor` and `Unity.GraphToolkit.Common.Editor`
2. **Expecting runtime execution** — Graph Toolkit is editor-only; build your own runtime interpreter
3. **Not marking nodes as `[Serializable]`** — without this attribute, node data is lost on domain reload
4. **Mixing editor and runtime code** — keep Graph Toolkit types in Editor assemblies; runtime code must not reference `Unity.GraphToolkit.Editor`
5. **Hard-coding port count** — for dynamic ports (like ChoiceNode above), regenerate ports when data changes by calling the port definition API
6. **Ignoring the export pipeline** — plan how graph data reaches your runtime from day one; retrofitting an exporter is painful

---

## Version History

| Unity Version | Graph Toolkit Status |
|:---:|---|
| 6.2 | Experimental package (`com.unity.graphtoolkit@0.1.0-exp.1`) |
| 6.3 | Experimental, updated samples |
| 6.4 | Core module (ships with editor, no manual install) |
| 6.5 alpha | New features: improved search, node grouping |

> **Note:** Since Graph Toolkit is evolving rapidly, APIs may change between versions. Pin to a specific Unity version for stability and check the [Unity Graph Toolkit changelog](https://docs.unity3d.com/Packages/com.unity.graphtoolkit@0.1/changelog/CHANGELOG.html) before upgrading.

---

## Key Takeaways

- Graph Toolkit is the **official replacement for GraphView** — invest in it for new editor tools
- It provides **UI infrastructure** (nodes, wires, undo, inspector, blackboard) — you provide **domain logic**
- It is **editor-only** — you must build a runtime interpreter or export pipeline for game use
- Define your graph with `[Graph]` + `Graph` subclass, nodes with `[Serializable]` + `Node` subclass
- Use **typed ports** (`IPortDefinitionContext`) to enforce valid connections
- Plan your **export pipeline** (editor asset → runtime data) from the start
- Available as a module starting in **Unity 6.4** — experimental in 6.2/6.3
