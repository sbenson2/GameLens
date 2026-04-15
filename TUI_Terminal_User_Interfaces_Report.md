# Terminal User Interfaces (TUI) — A Complete Guide

**Date:** April 13, 2026

---

## Table of Contents

1. [What is a TUI?](#what-is-a-tui)
2. [How Terminal Rendering Works](#how-terminal-rendering-works)
3. [Architecture Patterns](#architecture-patterns)
4. [Major Frameworks](#major-frameworks)
5. [Famous TUI Applications](#famous-tui-applications)
6. [Key Concepts Reference](#key-concepts-reference)
7. [Sources](#sources)

---

## 1. What is a TUI?

A **TUI (Terminal User Interface)** is a user interface that runs inside a terminal emulator. Unlike a bare CLI where you type a command and get text output, a TUI takes over the entire terminal screen and renders an interactive, structured interface — panels, lists, tables, colors, borders — all made of text characters.

TUIs sit between CLIs and GUIs on the interface spectrum:

```
CLI  ──────────────  TUI  ──────────────  GUI
"git log"          lazygit            GitHub Desktop
plain text in/out  full-screen,       windows, mouse,
                   keyboard-driven    pixels
```

### Why TUIs Matter

- **Resource efficient** — run in a terminal, consume far fewer resources than GUIs
- **Remote-friendly** — work over SSH, no display server needed
- **Keyboard-driven** — faster workflows for power users
- **Portable** — work on any system with a terminal emulator
- **Composable** — fit naturally into Unix pipelines and workflows
- **Accessible** — no GPU, no window manager, works on minimal hardware

TUIs have experienced a renaissance in recent years, driven by modern frameworks that make them easier to build and more visually appealing than ever before.

---

## 2. How Terminal Rendering Works

Understanding the rendering layer demystifies everything about TUIs.

### 2.1 The Terminal is a Character Grid

Your terminal is a **grid of cells** (e.g., 120 columns x 40 rows). Each cell holds:

- **One character** (UTF-8 encoded)
- **A foreground color** (text color)
- **A background color** (cell background)
- **Style attributes** (bold, italic, underline, strikethrough, dim, etc.)

A TUI framework's job is to figure out what character + style goes in every cell, then write the result to stdout.

### 2.2 ANSI Escape Codes — The Instruction Set

Terminals don't have a drawing API like a GPU. Instead, you write special byte sequences to stdout that the terminal interprets as commands. These are **ANSI escape codes**, standardized as ANSI X3.64 / ECMA-48.

#### Common escape sequences:

| Sequence | Effect |
|----------|--------|
| `\x1b[31m` | Set text color to red |
| `\x1b[1m` | Bold text |
| `\x1b[0m` | Reset all styles |
| `\x1b[5;10H` | Move cursor to row 5, column 10 |
| `\x1b[2J` | Clear the entire screen |
| `\x1b[?25l` | Hide cursor |
| `\x1b[?25h` | Show cursor |
| `\x1b[?1049h` | Switch to alternate screen buffer |
| `\x1b[?1049l` | Switch back to main screen buffer |

#### Sequence structure:

```
\x1b[  =  CSI (Control Sequence Introducer) — starts most commands
\x1b]  =  OSC (Operating System Command) — for terminal titles, colors
\x1bP  =  DCS (Device Control String) — for more complex sequences
```

A TUI render frame is: **move cursor → set style → write character** — repeated for every cell that changed.

#### Color support tiers:

| Tier | Colors | Escape format |
|------|--------|---------------|
| Basic | 8 colors | `\x1b[30-37m` (fg), `\x1b[40-47m` (bg) |
| Extended | 256 colors | `\x1b[38;5;Nm` (fg), `\x1b[48;5;Nm` (bg) |
| True Color | 16.7M colors | `\x1b[38;2;R;G;Bm` (fg), `\x1b[48;2;R;G;Bm` (bg) |

Most modern terminals support true color (24-bit RGB).

### 2.3 Alternate Screen Buffer

When you launch a TUI app like `htop`, it "takes over" your terminal. When you quit, your old scrollback is still there. This is the **alternate screen buffer** — a second screen the terminal can swap to. TUI apps enter it on start (`\x1b[?1049h`) and leave it on exit (`\x1b[?1049l`).

### 2.4 Raw Mode vs Cooked Mode

Normally your terminal is in **cooked mode** (also called canonical mode):

- Input is line-buffered (waits for Enter)
- Backspace works automatically
- Characters are echoed to screen
- Ctrl+C sends SIGINT

TUI apps switch to **raw mode**:

- Every keypress is sent immediately (no line buffering)
- No automatic echo
- Control characters (Ctrl+C) arrive as raw bytes, not signals
- The application handles everything itself

This is done via `termios` on Unix systems (the `cfmakeraw()` call or manual flag manipulation).

### 2.5 Mouse Input

Modern terminals support mouse event reporting via escape sequences:

1. The app opts in: `\x1b[?1006h` (SGR mouse mode)
2. Mouse events arrive as encoded sequences: `\x1b[<button;col;row;M/m`
3. Encodes: button pressed, cell position (1-based), press vs release
4. Modifier keys (Shift, Ctrl, Alt) are encoded in the button byte

### 2.6 How a Frame Gets Painted

```
1. Event arrives (keypress, mouse click, terminal resize, timer tick)
2. Application updates its internal state/model
3. Layout engine calculates widget positions
   (split terminal grid into rectangles using constraints)
4. Each widget renders into its assigned rectangle
   (fills a buffer of cells: character + foreground + background + style)
5. Framework diffs the new buffer against the previous frame
6. Only changed cells get written to stdout:
   \x1b[row;colH        ← move cursor to position
   \x1b[fg;bg;attrsm    ← set colors and style
   <character>           ← the actual visible content
7. Flush stdout to the terminal
```

**Step 5 (diffing) is critical for performance.** You don't repaint all 4,800 cells (120x40) every frame — only the ones that actually changed since last frame.

---

## 3. Architecture Patterns

TUI frameworks use one of two major architectural patterns:

### 3.1 Immediate Mode

**You own the main loop.** Every frame, you describe the entire UI from scratch based on current state. The framework handles diffing and only writes changed cells.

```
loop {
    read_events()           // keyboard, mouse, resize
    update_state()          // modify your model
    terminal.draw(|frame| {
        // describe the ENTIRE UI every frame
        render_widgets(frame, &state)
    })
}
```

**Used by:** Ratatui (Rust), tui-rs (Rust, deprecated)

**Analogy:** Like a game render loop — you redraw the world every tick.

**Pros:**
- Maximum flexibility and control
- Easy to reason about (state in → UI out)
- No hidden state in the framework

**Cons:**
- More boilerplate for the developer
- You manage the event loop yourself
- Must handle async operations manually

### 3.2 The Elm Architecture (TEA)

**The framework owns the loop.** You provide three functions:

```
Model   →  Your application state (a struct/type)
Update  →  (model, message) → (new_model, command)
View    →  (model) → string/widget tree (the UI to display)
```

Messages flow in (keypresses, timer ticks, async results), your `Update` function produces a new model, and `View` renders it. The framework handles the loop, diffing, and drawing.

**Used by:** Bubbletea (Go), Textual (Python)

**Analogy:** Like React — declare what the UI should look like given state, let the framework reconcile.

**Pros:**
- Clean separation of concerns
- Predictable data flow
- Easier to test (pure functions)
- Framework handles async/commands

**Cons:**
- Less control over rendering details
- Everything must flow through messages
- Can feel indirect for simple interactions

### 3.3 Comparison

| Aspect | Immediate Mode | Elm/TEA |
|--------|----------------|---------|
| Who owns the loop | You | Framework |
| State management | Your responsibility | Structured by pattern |
| Flexibility | Maximum | More guided |
| Learning curve | Steeper entry, simpler concepts | More structure to learn |
| Best for | Complex custom UIs | Standard app patterns |
| Async handling | Manual | Built-in command system |

---

## 4. Major Frameworks

### 4.1 Rust — Ratatui

**The dominant Rust TUI library.** Community fork of tui-rs, now the standard.

- **Architecture:** Immediate mode rendering
- **Widget system:** Paragraphs, lists, tables, charts, gauges, sparklines, block borders, tabs, scrollbars
- **Layout engine:** Constraint-based (percentages, min/max, fixed, ratio)
- **Performance:** 30-40% less memory, 15% lower CPU than equivalents in other languages
- **Users:** Netflix, AWS, Vercel, OpenAI (internal tooling)
- **Ecosystem:** 2,100+ dependent crates

```rust
// Ratatui example structure
fn ui(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(0),
        ])
        .split(frame.area());

    let title = Paragraph::new("My TUI App")
        .block(Block::default().borders(Borders::ALL));
    frame.render_widget(title, chunks[0]);
}
```

**Website:** https://ratatui.rs/

### 4.2 Go — Bubbletea + Lip Gloss + Bubbles

**By Charm (charmbracelet).** A cohesive ecosystem:

- **Bubbletea** — The framework (model/update/view loop, Elm Architecture)
- **Bubbles** — Pre-built components (text inputs, spinners, lists, tables, file pickers, paginated views)
- **Lip Gloss** — Styling library (CSS-like API for terminal styling: colors, borders, padding, alignment)

```go
// Bubbletea example structure
type model struct {
    choices  []string
    cursor   int
    selected map[int]struct{}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.String() {
        case "up":
            m.cursor--
        case "down":
            m.cursor++
        }
    }
    return m, nil
}

func (m model) View() string {
    s := "Pick items:\n\n"
    for i, choice := range m.choices {
        cursor := " "
        if m.cursor == i { cursor = ">" }
        s += fmt.Sprintf("%s %s\n", cursor, choice)
    }
    return s
}
```

**Fastest path to a polished TUI in Go.** The Charm ecosystem handles styling, components, and the framework in one coherent package.

### 4.3 Python — Textual + Rich

Two complementary libraries:

- **Rich** — Library for rich terminal formatting: tables, markdown, syntax highlighting, progress bars, trees, panels. Not a full TUI framework, but the rendering foundation.
- **Textual** — Full TUI framework built on Rich. Inspired by web development: CSS-like layouts, async event handling, reactive data binding. Has a web mode that can serve TUIs in a browser.

```python
# Textual example
from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, Static

class MyApp(App):
    CSS = """
    Screen {
        layout: vertical;
    }
    """
    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("Hello, TUI world!")
        yield Footer()

MyApp().run()
```

### 4.4 Node.js — Ink

**React for the terminal.** Uses JSX components rendered to terminal output with Yoga (flexbox) for layout.

```jsx
import {render, Text, Box} from 'ink';

const App = () => (
    <Box flexDirection="column" padding={1}>
        <Text bold color="green">Hello TUI!</Text>
        <Text>Built with React concepts</Text>
    </Box>
);

render(<App />);
```

Notable: **Claude Code** (this very tool) is built with Ink.

### 4.5 C — ncurses

The original TUI library, dating back to the 1980s. Low-level, direct terminal manipulation. Most modern frameworks either abstract over it or replace it entirely. Still relevant for understanding fundamentals and for C/C++ projects.

### 4.6 Framework Comparison

| Framework | Language | Architecture | Strengths |
|-----------|----------|-------------|-----------|
| **Ratatui** | Rust | Immediate mode | Performance, control, widget variety |
| **Bubbletea** | Go | Elm/TEA | Developer experience, ecosystem |
| **Textual** | Python | Async/reactive | CSS layouts, web mode, rapid prototyping |
| **Ink** | Node.js | React components | Familiar React model, JSX |
| **ncurses** | C | Procedural | Low-level control, universal availability |

---

## 5. Famous TUI Applications

### System Monitoring

| App | Description | Language | Framework |
|-----|-------------|----------|-----------|
| **htop** | Interactive process viewer | C | ncurses |
| **btop** | Beautiful resource monitor (CPU, memory, disk, network) | C++ | Custom |
| **bottom** | Customizable system monitor | Rust | Ratatui |
| **glances** | Cross-platform monitoring | Python | curses |

### Git & Version Control

| App | Description | Language | Framework |
|-----|-------------|----------|-----------|
| **lazygit** | Terminal UI for git commands | Go | gocui |
| **tig** | Text-mode interface for git | C | ncurses |
| **gitui** | Fast git TUI | Rust | Custom |

### File Management

| App | Description | Language | Framework |
|-----|-------------|----------|-----------|
| **yazi** | Fast async file manager with image preview | Rust | Ratatui |
| **ranger** | Vim-inspired file manager | Python | curses |
| **lf** | Terminal file manager | Go | Custom |
| **nnn** | Tiny, fast file manager | C | ncurses |

### DevOps & Infrastructure

| App | Description | Language | Framework |
|-----|-------------|----------|-----------|
| **lazydocker** | Docker management UI | Go | gocui |
| **k9s** | Kubernetes dashboard | Go | tview |
| **dry** | Docker manager | Go | Custom |

### Development Tools

| App | Description | Language | Framework |
|-----|-------------|----------|-----------|
| **neovim** | Extensible text editor | C | Custom |
| **Claude Code** | AI coding assistant | TypeScript | Ink |
| **gobang** | Database management | Rust | Ratatui |
| **posting** | HTTP client | Python | Textual |

### Music & Media

| App | Description | Language | Framework |
|-----|-------------|----------|-----------|
| **cmus** | Music player | C | ncurses |
| **spotify-tui** | Spotify client | Rust | tui-rs |

---

## 6. Key Concepts Reference

| Concept | Definition |
|---------|-----------|
| **Cell** | One character slot in the terminal grid (char + foreground + background + style) |
| **ANSI escape codes** | Byte sequences that control cursor position, color, style, and screen state |
| **CSI** | Control Sequence Introducer (`\x1b[`) — prefix for most escape commands |
| **Alternate screen** | Second screen buffer so TUI apps don't destroy scrollback history |
| **Raw mode** | Terminal sends every keypress immediately with no buffering or echo |
| **Cooked mode** | Normal terminal mode with line buffering and automatic echo |
| **Immediate mode** | Redraw the full UI every frame from current state; you own the loop |
| **TEA / Elm Architecture** | Model → Update → View pattern; the framework owns the loop |
| **Widget** | Reusable UI component (table, list, input field, gauge, chart) |
| **Layout** | System for splitting the terminal grid into rectangles with constraints |
| **Constraint** | Rule for sizing: fixed (10 cols), percentage (50%), min/max, ratio |
| **Diffing** | Comparing current frame to previous frame; only writing cells that changed |
| **termios** | Unix API for configuring terminal behavior (raw/cooked mode) |
| **SGR** | Select Graphic Rendition — the escape sequence subset for colors and styles |
| **Box-drawing characters** | Unicode characters (─ │ ┌ ┐ └ ┘ ├ ┤) used for borders and lines |
| **True color** | 24-bit RGB color support (16.7 million colors) in modern terminals |

---

## 7. Sources

- [Text-based user interface — Wikipedia](https://en.wikipedia.org/wiki/Text-based_user_interface)
- [Build your own Command Line with ANSI escape codes — Li Haoyi](https://www.lihaoyi.com/post/BuildyourownCommandLinewithANSIescapecodes.html)
- [ANSI escape code — Wikipedia](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [The Elm Architecture (TEA) — Ratatui Documentation](https://ratatui.rs/concepts/application-patterns/the-elm-architecture/)
- [Rendering Concepts — Ratatui Documentation](https://ratatui.rs/concepts/rendering/)
- [Go vs Rust for TUI Development — DEV Community](https://dev.to/dev-tngsh/go-vs-rust-for-tui-development-a-deep-dive-into-bubbletea-and-ratatui-2b7)
- [Terminal UI: BubbleTea vs Ratatui — Rost Glukhov](https://www.glukhov.org/post/2026/02/tui-frameworks-bubbletea-go-vs-ratatui-rust/)
- [Awesome TUIs — Curated List (GitHub)](https://github.com/rothgar/awesome-tuis)
- [Essential CLI/TUI Tools for Developers — freeCodeCamp](https://www.freecodecamp.org/news/essential-cli-tui-tools-for-developers/)
- [The Terminal Renaissance: Designing Beautiful TUIs — DEV Community](https://dev.to/hyperb1iss/the-terminal-renaissance-designing-beautiful-tuis-in-the-age-of-ai-24do)
- [ANSI Escape Sequences Cheatsheet (GitHub Gist)](https://gist.github.com/ConnerWill/d4b6c776b509add763e17f9f113fd25b)
- [TUI Definition — Doppler Glossary](https://www.doppler.com/glossary/text-user-interface-tui)
