# G67 — Dialogue & Narrative Systems

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G5 UI Toolkit](G5_ui_toolkit.md) · [G17 Localization](G17_localization.md) · [G6 Save/Load System](G6_save_load_system.md) · [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [Unity Rules](../unity-arch-rules.md)

Most games with story elements need a dialogue system — branching conversations, character lines, player choices, and state tracking. This guide covers architecture patterns for dialogue, integration with the two leading open-source narrative tools (**Yarn Spinner** and **ink**), and how to build a lightweight custom system when middleware is overkill.

---

## Choosing an Approach

| Approach | Best For | Trade-off |
|----------|----------|-----------|
| **Yarn Spinner** (free, open-source) | Narrative-heavy indie games, visual novels, adventure games | Writer-friendly syntax, node-based editor; requires learning Yarn language |
| **ink** (free, open-source by Inkle) | Text-heavy interactive fiction, complex branching | Prose-like authoring; less visual tooling, manual UI integration |
| **Dialogue System for Unity** ($75 Asset Store) | Commercial RPGs, quest-heavy games | Feature-complete out of box; paid, large API surface |
| **Custom system** | Simple linear or low-branch dialogue | Full control; you build and maintain everything |

> **Decision point:** If your game has more than ~20 conversations or any non-trivial branching, use Yarn Spinner or ink. The time you save on serialization, branching logic, and localization support will far outweigh the learning curve.

---

## Architecture: Separation of Concerns

Regardless of which tool you use, dialogue systems should follow this layered pattern:

```
┌──────────────────────────────────────────────────────────┐
│                    Dialogue Content                       │
│  (.yarn files, .ink files, or ScriptableObject data)     │
│  Written by: narrative designers / writers                │
└──────────────────────┬───────────────────────────────────┘
                       │ parsed by
┌──────────────────────▼───────────────────────────────────┐
│                   Dialogue Runtime                        │
│  (Yarn DialogueRunner, ink Story, or custom parser)      │
│  Responsibilities: branching, variable tracking,         │
│  localization keys, command dispatch                     │
└──────────────────────┬───────────────────────────────────┘
                       │ events / callbacks
┌──────────────────────▼───────────────────────────────────┐
│                   Presentation Layer                      │
│  (UI Toolkit or uGUI: text boxes, portraits, choices)   │
│  Responsibilities: typewriter effect, animations,        │
│  input handling, accessibility                           │
└──────────────────────┬───────────────────────────────────┘
                       │ commands trigger
┌──────────────────────▼───────────────────────────────────┐
│                   Game Integration                        │
│  (Inventory changes, quest flags, camera cuts, audio)    │
│  Responsibilities: side effects from dialogue commands   │
└──────────────────────────────────────────────────────────┘
```

> **Key principle:** Writers edit content files. Programmers build the runtime and presentation. Neither needs to touch the other's work.

---

## Yarn Spinner Integration

Yarn Spinner is the most popular open-source dialogue tool for Unity. Writers author `.yarn` files in a simple markup language, and the Unity integration provides `DialogueRunner`, `LineView`, and `OptionsListView` components.

### Installation

```
Package Manager → Add package from git URL:
  https://github.com/YarnSpinnerTool/YarnSpinner-Unity.git

Or via OpenUPM:
  openupm add dev.yarnspinner.unity
```

### Yarn Script Basics

```yarn
// WHY .yarn files: Plain text that version-controls cleanly (no binary assets).
// Writers can use the Yarn Spinner VS Code extension or web editor for
// node-based visual editing.

title: MeetBlacksmith
tags:
---
Blacksmith: Welcome, traveler. What brings you to my forge?

-> I need a sword.
    Blacksmith: Aye, I can make one. But I'll need iron ore.
    <<if $hasIronOre>>
        Blacksmith: Ah, you already have some! Let me get to work.
        <<set $hasSword to true>>
        <<command GiveItem sword>>
    <<else>>
        Blacksmith: You'll find iron in the eastern mines.
        <<set $questActive_ironOre to true>>
    <<endif>>

-> Just looking around.
    Blacksmith: Take your time. My wares speak for themselves.

-> [if $hasSword] About that sword you made me...
    Blacksmith: Treating you well, I hope?
===
```

### Unity Setup

```csharp
using UnityEngine;
using Yarn.Unity;

public class NPCDialogueTrigger : MonoBehaviour
{
    // WHY DialogueRunner reference: The DialogueRunner is the central hub
    // that processes .yarn files, manages variables, and dispatches lines
    // to dialogue views. One runner can serve your entire game.
    [SerializeField] private DialogueRunner _dialogueRunner;
    [SerializeField] private string _startNode = "MeetBlacksmith";

    // WHY separate trigger from runner: The NPC knows WHICH conversation
    // to start, but doesn't know HOW dialogue is displayed. The runner
    // and its views handle presentation.

    public void StartConversation()
    {
        if (!_dialogueRunner.IsDialogueRunning)
        {
            _dialogueRunner.StartDialogue(_startNode);
        }
    }

    // Register for proximity trigger (collider-based)
    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player"))
        {
            // Show "Press E to talk" prompt
            ShowInteractionPrompt(true);
        }
    }

    void OnTriggerExit(Collider other)
    {
        if (other.CompareTag("Player"))
            ShowInteractionPrompt(false);
    }

    private void ShowInteractionPrompt(bool show) { /* UI logic */ }
}
```

### Custom Yarn Commands

```csharp
using Yarn.Unity;
using UnityEngine;

public class DialogueCommands : MonoBehaviour
{
    // WHY [YarnCommand]: Registers a C# method as a Yarn command.
    // Writers call <<command GiveItem sword>> in .yarn files, and this
    // method executes. No string parsing needed — Yarn handles argument
    // conversion automatically.

    [YarnCommand("GiveItem")]
    public void GiveItem(string itemName)
    {
        // WHY delegate to inventory system: The dialogue command is a thin
        // bridge. Actual item logic lives in the inventory system.
        InventoryManager.Instance.AddItem(itemName);
        Debug.Log($"Player received: {itemName}");
    }

    [YarnCommand("PlayEmote")]
    public void PlayEmote(string emoteName, GameObject target)
    {
        // Yarn can pass GameObjects by name from the scene
        var animator = target.GetComponent<Animator>();
        animator?.SetTrigger(emoteName);
    }

    [YarnCommand("CameraFocus")]
    public static void CameraFocus(string targetName, float duration)
    {
        // Static commands work too — useful for system-level operations
        var target = GameObject.Find(targetName);
        if (target != null)
        {
            CameraManager.Instance.FocusOn(target.transform, duration);
        }
    }
}
```

### Custom Dialogue View (UI Toolkit)

```csharp
using UnityEngine;
using UnityEngine.UIElements;
using Yarn.Unity;
using System.Collections;

public class UIToolkitDialogueView : DialogueViewBase
{
    // WHY custom DialogueViewBase: Yarn Spinner's built-in views use uGUI.
    // For UI Toolkit projects, implement DialogueViewBase to control
    // your own UXML-based dialogue panel.

    [SerializeField] private UIDocument _uiDocument;

    private Label _speakerLabel;
    private Label _dialogueLabel;
    private VisualElement _choicesContainer;
    private VisualElement _dialoguePanel;

    private System.Action _onLineFinished;
    private System.Action<int> _onChoiceSelected;

    void OnEnable()
    {
        var root = _uiDocument.rootVisualElement;
        _dialoguePanel = root.Q("dialogue-panel");
        _speakerLabel = root.Q<Label>("speaker-name");
        _dialogueLabel = root.Q<Label>("dialogue-text");
        _choicesContainer = root.Q("choices-container");
        _dialoguePanel.style.display = DisplayStyle.None;
    }

    // WHY RunLine: Called by DialogueRunner when a new line of dialogue
    // should be displayed. The onDialogueLineFinished callback advances
    // the conversation when the player is ready.
    public override void RunLine(LocalizedLine dialogueLine,
        System.Action onDialogueLineFinished)
    {
        _dialoguePanel.style.display = DisplayStyle.Flex;
        _speakerLabel.text = dialogueLine.CharacterName ?? "";
        _onLineFinished = onDialogueLineFinished;

        // Start typewriter effect
        StartCoroutine(TypewriterEffect(dialogueLine.TextWithoutCharacterName.Text));
    }

    private IEnumerator TypewriterEffect(string fullText)
    {
        _dialogueLabel.text = "";
        foreach (char c in fullText)
        {
            _dialogueLabel.text += c;
            yield return new WaitForSeconds(0.03f);
        }
    }

    // WHY UserRequestedViewAdvancement: Called when the player clicks
    // or presses a key to advance. We complete any typewriter animation
    // and signal that this line is done.
    public override void UserRequestedViewAdvancement()
    {
        StopAllCoroutines();
        _onLineFinished?.Invoke();
    }

    // WHY RunOptions: Called when the player needs to make a choice.
    // Build UI buttons dynamically from the options list.
    public override void RunOptions(DialogueOption[] dialogueOptions,
        System.Action<int> onOptionSelected)
    {
        _choicesContainer.Clear();
        _onChoiceSelected = onOptionSelected;

        for (int i = 0; i < dialogueOptions.Length; i++)
        {
            if (!dialogueOptions[i].IsAvailable) continue;

            int index = dialogueOptions[i].DialogueOptionID;
            var button = new Button(() => _onChoiceSelected(index))
            {
                text = dialogueOptions[i].Line.TextWithoutCharacterName.Text
            };
            button.AddToClassList("choice-button");
            _choicesContainer.Add(button);
        }
    }

    public override void DialogueComplete()
    {
        _dialoguePanel.style.display = DisplayStyle.None;
    }
}
```

---

## ink Integration

ink uses a prose-like markup where branching reads naturally. The Unity integration compiles `.ink` files to JSON, and you drive the `Story` object from C#.

### Installation

```
Download from: https://github.com/inkle/ink-unity-integration
Or via Asset Store: "ink Unity Integration" (free)
```

### ink Script Basics

```ink
// WHY ink's prose format: Writers who think in terms of prose rather than
// nodes find ink more natural. The script reads like a story, with choices
// inline. Compilation to JSON keeps the runtime tiny (~50KB).

=== meet_blacksmith ===
The blacksmith looks up from her anvil, sweat glistening on her brow.

"Welcome, traveler. What brings you to my forge?"

* [I need a sword.]
    "Aye, I can make one. But I'll need iron ore."
    {hasIronOre:
        "Ah, you already have some! Let me get to work."
        ~ hasSword = true
        -> sword_crafted
    - else:
        "You'll find iron in the eastern mines."
        ~ questActive_ironOre = true
        -> END
    }
* [Just looking around.]
    "Take your time. My wares speak for themselves."
    -> END
* {hasSword} [About that sword you made me...]
    "Treating you well, I hope?"
    -> END

=== sword_crafted ===
She takes the ore and works it with practiced hands.
After an hour, she presents you with a gleaming blade.
-> END
```

### Unity Runtime

```csharp
using Ink.Runtime;
using UnityEngine;
using System.Collections.Generic;

public class InkDialogueManager : MonoBehaviour
{
    // WHY TextAsset: The ink compiler converts .ink files to .json at
    // edit time. Unity loads the JSON as a TextAsset, which the Story
    // constructor parses into a runtime narrative graph.
    [SerializeField] private TextAsset _inkJSON;

    private Story _story;

    // Events for the presentation layer to subscribe to
    public System.Action<string> OnDialogueLine;
    public System.Action<List<Choice>> OnChoicesPresented;
    public System.Action OnDialogueEnd;

    public void StartDialogue(string knotName = null)
    {
        _story = new Story(_inkJSON.text);

        // WHY bind external functions: ink can call C# methods, enabling
        // game state checks without ink knowing about your systems.
        _story.BindExternalFunction("HasItem", (string itemName) =>
        {
            return InventoryManager.Instance.HasItem(itemName);
        });

        if (!string.IsNullOrEmpty(knotName))
        {
            _story.ChoosePathString(knotName);
        }

        ContinueStory();
    }

    public void ContinueStory()
    {
        // WHY loop with canContinue: ink separates "continuing text"
        // from "presenting choices." You advance line by line until
        // either choices appear or the story ends.
        if (_story.canContinue)
        {
            // WHY Continue() not ContinueMaximally(): Continue() returns
            // one paragraph at a time, letting you pace delivery with
            // typewriter effects. ContinueMaximally() dumps all text
            // until the next choice — useful for logs, bad for dialogue.
            string text = _story.Continue();

            // WHY process tags: ink tags (#speaker:Blacksmith, #mood:angry)
            // carry metadata without polluting the dialogue text.
            ProcessTags(_story.currentTags);

            OnDialogueLine?.Invoke(text.Trim());
        }

        if (_story.currentChoices.Count > 0)
        {
            OnChoicesPresented?.Invoke(_story.currentChoices);
        }
        else if (!_story.canContinue)
        {
            OnDialogueEnd?.Invoke();
        }
    }

    public void SelectChoice(int choiceIndex)
    {
        // WHY ChooseChoiceIndex: After the player picks an option,
        // this tells the Story to follow that branch. Then call
        // ContinueStory() to get the next line.
        _story.ChooseChoiceIndex(choiceIndex);
        ContinueStory();
    }

    private void ProcessTags(List<string> tags)
    {
        foreach (string tag in tags)
        {
            // WHY tag parsing: Tags like #speaker:Name, #portrait:happy
            // let writers control presentation without code changes.
            string[] parts = tag.Split(':');
            if (parts.Length == 2)
            {
                string key = parts[0].Trim();
                string value = parts[1].Trim();

                switch (key)
                {
                    case "speaker":
                        SetSpeakerName(value);
                        break;
                    case "portrait":
                        SetPortrait(value);
                        break;
                    case "sfx":
                        PlaySFX(value);
                        break;
                }
            }
        }
    }

    private void SetSpeakerName(string name) { /* Update UI */ }
    private void SetPortrait(string expression) { /* Update portrait */ }
    private void PlaySFX(string clipName) { /* Trigger audio */ }

    // --- Save/Load ink state ---
    public string SaveState()
    {
        // WHY JSON state: ink serializes its entire runtime state
        // (variables, visit counts, current position) to a JSON string.
        // Store this alongside your save file.
        return _story.state.toJson();
    }

    public void LoadState(string json)
    {
        _story.state.LoadJson(json);
    }
}
```

---

## Custom Lightweight System

For games with simple, linear dialogue (tutorials, short cutscenes):

```csharp
using UnityEngine;
using System.Collections.Generic;

// WHY ScriptableObject-based: For <20 conversations with minimal branching,
// a full narrative tool is overkill. ScriptableObjects give you Inspector
// editing, easy serialization, and no external dependencies.

[CreateAssetMenu(fileName = "NewDialogue", menuName = "Dialogue/Conversation")]
public class DialogueData : ScriptableObject
{
    [System.Serializable]
    public class DialogueLine
    {
        public string speakerName;
        [TextArea(2, 5)] public string text;
        public Sprite portrait;
        public AudioClip voiceClip; // Optional VO
        public DialogueChoice[] choices; // Empty = auto-advance
    }

    [System.Serializable]
    public class DialogueChoice
    {
        public string choiceText;
        public DialogueData nextConversation; // Branch to another SO
        public string requiredFlag; // Empty = always available
    }

    public DialogueLine[] lines;
}

public class SimpleDialogueRunner : MonoBehaviour
{
    [SerializeField] private DialogueData _currentDialogue;
    private int _lineIndex;

    public System.Action<DialogueData.DialogueLine> OnShowLine;
    public System.Action OnDialogueEnd;

    public void StartDialogue(DialogueData dialogue)
    {
        _currentDialogue = dialogue;
        _lineIndex = 0;
        ShowCurrentLine();
    }

    public void Advance()
    {
        var currentLine = _currentDialogue.lines[_lineIndex];

        // If current line has choices, don't auto-advance
        if (currentLine.choices != null && currentLine.choices.Length > 0)
            return;

        _lineIndex++;
        if (_lineIndex < _currentDialogue.lines.Length)
        {
            ShowCurrentLine();
        }
        else
        {
            OnDialogueEnd?.Invoke();
        }
    }

    public void SelectChoice(int choiceIndex)
    {
        var choice = _currentDialogue.lines[_lineIndex].choices[choiceIndex];
        if (choice.nextConversation != null)
        {
            StartDialogue(choice.nextConversation);
        }
        else
        {
            _lineIndex++;
            if (_lineIndex < _currentDialogue.lines.Length)
                ShowCurrentLine();
            else
                OnDialogueEnd?.Invoke();
        }
    }

    private void ShowCurrentLine()
    {
        OnShowLine?.Invoke(_currentDialogue.lines[_lineIndex]);
    }
}
```

---

## Localization Integration

Both Yarn Spinner and ink support Unity's Localization package:

```csharp
// WHY Unity Localization package: Yarn Spinner has built-in support for
// generating string tables from .yarn files. ink requires a custom
// extraction step but the runtime tags approach works well.

// Yarn Spinner: Automatic string table generation
// 1. Add YarnProject asset → Localization tab
// 2. Select "Export Strings" → generates .csv per locale
// 3. Translators fill in the .csv files
// 4. Import back into the String Table Collection
// The DialogueRunner automatically uses the current locale.

// ink: Tag-based localization
// Use tags to mark translatable lines:
//   Hello, adventurer. #line:greeting_001
// Extract tagged lines with a build script, translate, and load
// the correct JSON per locale at runtime.
```

---

## Common Patterns

### Dialogue Triggering

```csharp
// WHY interaction zone pattern: Most games use a collider trigger zone
// around NPCs. The player enters the zone, sees a prompt, and presses
// a button to start dialogue. This keeps the input handling centralized.

public class InteractionZone : MonoBehaviour
{
    [SerializeField] private string _dialogueNode;
    [SerializeField] private GameObject _promptUI;

    private bool _playerInRange;

    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player"))
        {
            _playerInRange = true;
            _promptUI.SetActive(true);
        }
    }

    void OnTriggerExit(Collider other)
    {
        if (other.CompareTag("Player"))
        {
            _playerInRange = false;
            _promptUI.SetActive(false);
        }
    }

    void Update()
    {
        if (_playerInRange && Input.GetButtonDown("Interact"))
        {
            DialogueManager.Instance.StartDialogue(_dialogueNode);
            _promptUI.SetActive(false);
        }
    }
}
```

### Typewriter Effect

```csharp
using System.Collections;
using UnityEngine;
using TMPro;

public class TypewriterEffect : MonoBehaviour
{
    [SerializeField] private TMP_Text _textComponent;
    [SerializeField] private float _charsPerSecond = 40f;
    [SerializeField] private AudioSource _typeSFX;

    private Coroutine _typeCoroutine;
    private string _fullText;

    // WHY TMP maxVisibleCharacters: Instead of appending characters to the
    // string (which triggers layout rebuild each frame), set the full text
    // once and reveal characters by incrementing maxVisibleCharacters.
    // This is significantly cheaper for rich text with tags.

    public void ShowText(string text, System.Action onComplete = null)
    {
        _fullText = text;
        _textComponent.text = text;
        _textComponent.maxVisibleCharacters = 0;

        if (_typeCoroutine != null)
            StopCoroutine(_typeCoroutine);

        _typeCoroutine = StartCoroutine(RevealText(onComplete));
    }

    public void SkipToEnd()
    {
        if (_typeCoroutine != null)
        {
            StopCoroutine(_typeCoroutine);
            _typeCoroutine = null;
        }
        _textComponent.maxVisibleCharacters = _fullText.Length;
    }

    private IEnumerator RevealText(System.Action onComplete)
    {
        int totalChars = _textComponent.textInfo.characterCount;
        float delay = 1f / _charsPerSecond;

        for (int i = 0; i <= totalChars; i++)
        {
            _textComponent.maxVisibleCharacters = i;

            // WHY play SFX every few chars: Playing on every character
            // sounds like a machine gun. Every 2-3 chars sounds natural.
            if (i % 3 == 0 && _typeSFX != null)
                _typeSFX.PlayOneShot(_typeSFX.clip);

            yield return new WaitForSeconds(delay);
        }

        _typeCoroutine = null;
        onComplete?.Invoke();
    }
}
```

---

## Saving Dialogue State

```csharp
// WHY separate dialogue save from game save: Dialogue state (which nodes
// were visited, what choices were made, NPC variable values) should be
// serialized alongside but independently from game state. This lets you
// version dialogue content without breaking save compatibility.

[System.Serializable]
public class DialogueSaveData
{
    public HashSet<string> visitedNodes = new();
    public Dictionary<string, object> variables = new();

    // For ink: store the full state JSON
    public string inkStateJson;

    // For Yarn: store variable storage snapshot
    public Dictionary<string, string> yarnVariables = new();
}
```

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Dialogue blocks player movement | Disable player input controller while dialogue is active; re-enable on complete |
| Choices not appearing | Yarn: ensure `OptionsListView` is assigned to DialogueRunner. ink: check `currentChoices.Count` after `Continue()` |
| Variables lost between scenes | Use `DontDestroyOnLoad` on the DialogueRunner, or persist variables via save system |
| Writers can't test without Unity | Yarn: use the web-based Try Yarn Spinner tool. ink: use the Inky standalone editor |
| Localization IDs drift | Assign stable line IDs (`#line:id`) rather than relying on auto-generated hashes |
| Typewriter skips rich text tags | Use `TMP_Text.maxVisibleCharacters` instead of string slicing |
