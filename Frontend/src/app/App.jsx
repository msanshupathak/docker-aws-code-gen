import "./App.css"
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useState, useEffect, useCallback } from "react"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"

const SUPPORTED_LANGUAGES = [
  { id: "javascript", label: "JavaScript", defaultSnippet: "// JavaScript\nfunction greet(name) {\n  console.log(`Hello, ${name}!`);\n}\ngreet('World');\n" },
  { id: "typescript", label: "TypeScript", defaultSnippet: "// TypeScript\ninterface User {\n  name: string;\n  role: string;\n}\nconst dev: User = { name: 'Alice', role: 'Architect' };\nconsole.log(dev);\n" },
  { id: "python", label: "Python", defaultSnippet: "# Python\ndef solve():\n    print('Collaborative coding in Python!')\n\nsolve()\n" },
  { id: "html", label: "HTML", defaultSnippet: "<!DOCTYPE html>\n<html>\n  <head><title>Live Collab</title></head>\n  <body>\n    <h1>Hello Real-time Web!</h1>\n  </body>\n</html>\n" },
  { id: "css", label: "CSS", defaultSnippet: "/* CSS */\nbody {\n  margin: 0;\n  background: #0f172a;\n  color: #f8fafc;\n  font-family: sans-serif;\n}\n" },
  { id: "cpp", label: "C++", defaultSnippet: "// C++\n#include <iostream>\n\nint main() {\n    std::cout << \"Hello from C++!\\n\";\n    return 0;\n}\n" },
  { id: "java", label: "Java", defaultSnippet: "// Java\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello from collaborative Java!\");\n    }\n}\n" },
  { id: "go", label: "Go", defaultSnippet: "// Go\npackage main\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello from Go!\")\n}\n" },
  { id: "rust", label: "Rust", defaultSnippet: "// Rust\nfn main() {\n    println!(\"Hello from Rust!\");\n}\n" },
  { id: "json", label: "JSON", defaultSnippet: "{\n  \"service\": \"collaborative-editor\",\n  \"status\": \"live\",\n  \"distributed\": true\n}\n" },
  { id: "sql", label: "SQL", defaultSnippet: "-- SQL Query\nSELECT user_id, username, created_at\nFROM active_sessions\nWHERE status = 'online'\nORDER BY created_at DESC;\n" },
  { id: "markdown", label: "Markdown", defaultSnippet: "# Project Notes\n\n- Real-time CRDT sync\n- Multi-language support\n- Isolated room workspaces\n" },
]

const AVATAR_COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4", "#F97316", "#14B8A6"
]

function App() {
  const editorRef = useRef(null)
  const bindingRef = useRef(null)

  const [username, setUsername] = useState(() => {
    return new URLSearchParams(window.location.search).get("username") || ""
  })
  const [room, setRoom] = useState(() => {
    return new URLSearchParams(window.location.search).get("room") || "main"
  })

  const [users, setUsers] = useState([])
  const [language, setLanguage] = useState("javascript")
  const [theme, setTheme] = useState("vs-dark")
  const [copied, setCopied] = useState(false)
  const [connected, setConnected] = useState(false)

  // Isolated Yjs document per room
  const ydoc = useMemo(() => new Y.Doc(), [room])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])
  const yMeta = useMemo(() => ydoc.getMap("meta"), [ydoc])

  // Random avatar color per session
  const userColor = useMemo(() => {
    return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  }, [])

  const handleMount = useCallback((editor) => {
    editorRef.current = editor

    if (bindingRef.current) {
      bindingRef.current.destroy()
    }

    bindingRef.current = new MonacoBinding(
      yText,
      editor.getModel(),
      new Set([editor])
    )
  }, [yText])

  const handleJoin = (e) => {
    e.preventDefault()
    const enteredUser = e.target.username.value.trim()
    const enteredRoom = (e.target.room.value.trim() || "main").toLowerCase().replace(/[^a-z0-9_-]/g, "-")

    if (!enteredUser) return

    setUsername(enteredUser)
    setRoom(enteredRoom)

    const params = new URLSearchParams()
    params.set("username", enteredUser)
    params.set("room", enteredRoom)
    window.history.pushState({}, "", `?${params.toString()}`)
  }

  const handleLeave = () => {
    setUsername("")
    window.history.pushState({}, "", window.location.pathname)
  }

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang)
    yMeta.set("language", newLang)
  }

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  useEffect(() => {
    if (!username || !room) return

    // Connect to room on socket server
    const provider = new SocketIOProvider("/", room, ydoc, {
      autoConnect: true,
    })

    provider.awareness.setLocalStateField("user", {
      username,
      color: userColor,
    })

    provider.on("status", (event) => {
      setConnected(event.status === "connected")
    })

    // Listen to shared room metadata (like active programming language)
    const initialLang = yMeta.get("language")
    if (initialLang && initialLang !== language) {
      setLanguage(initialLang)
    }

    const handleMetaObserver = () => {
      const currentRoomLang = yMeta.get("language")
      if (currentRoomLang) {
        setLanguage(currentRoomLang)
      }
    }
    yMeta.observe(handleMetaObserver)

    // Track active user awareness
    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values())
      setUsers(states.filter((state) => state.user && state.user.username).map((state) => state.user))
    }

    updateUsers()
    provider.awareness.on("change", updateUsers)

    function handleBeforeUnload() {
      provider.awareness.setLocalStateField("user", null)
    }
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      provider.awareness.setLocalStateField("user", null)
      yMeta.unobserve(handleMetaObserver)
      provider.disconnect()
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [username, room, ydoc, yMeta, userColor])

  // Join Screen
  if (!username) {
    return (
      <main className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-500/20">
              {"</>"}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Collaborative Code Editor</h1>
              <p className="text-xs text-slate-400">Real-time CRDT multi-user code workspace</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Your Name
              </label>
              <input
                type="text"
                name="username"
                required
                defaultValue={new URLSearchParams(window.location.search).get("username") || ""}
                placeholder="e.g. Anshu"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Room ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="room"
                  defaultValue={room}
                  placeholder="e.g. project-alpha"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    const form = e.currentTarget.closest("form")
                    const rand = "room-" + Math.random().toString(36).substring(2, 8)
                    form.room.value = rand
                  }}
                  className="px-3 py-2 text-xs font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  Random
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Each room is an isolated space with its own editor document and user list.
              </p>
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98]"
            >
              Enter Room & Collaborate →
            </button>
          </form>
        </div>
      </main>
    )
  }

  // Active Editor Workspace
  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
            {"</>"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white">CodeSync</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-800 border border-slate-700 text-blue-400">
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                #{room}
              </span>
            </div>
          </div>
        </div>

        {/* Center Controls: Language & Theme */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-xl px-2.5 py-1">
            <label className="text-xs text-slate-400 font-medium">Language:</label>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-blue-300 focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-slate-900 text-white">
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-xl px-2.5 py-1">
            <label className="text-xs text-slate-400 font-medium">Theme:</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="vs-dark" className="bg-slate-900 text-white">Dark</option>
              <option value="light" className="bg-slate-900 text-white">Light</option>
              <option value="hc-black" className="bg-slate-900 text-white">High Contrast</option>
            </select>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyInvite}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            {copied ? (
              <>
                <span className="text-emerald-400">✓</span> Link Copied
              </>
            ) : (
              <>
                <span>🔗</span> Copy Invite Link
              </>
            )}
          </button>

          <button
            onClick={handleLeave}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition-colors"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Active Collaborators */}
        <aside className="w-64 bg-slate-900/60 border-r border-slate-800 flex flex-col shrink-0">
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Collaborators ({users.length})
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>

          <div className="p-3 flex-1 overflow-y-auto space-y-1.5">
            {users.map((user, idx) => {
              const isSelf = user.username === username
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    isSelf
                      ? "bg-blue-950/40 border-blue-800/50 text-blue-200"
                      : "bg-slate-800/60 border-slate-700/60 text-slate-300"
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-white text-[11px] shadow-sm"
                    style={{ backgroundColor: user.color || "#3B82F6" }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate flex-1">{user.username}</span>
                  {isSelf && (
                    <span className="text-[10px] text-blue-400 font-semibold px-1.5 py-0.5 rounded bg-blue-900/40">
                      You
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Room Summary card */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/50">
            <div className="text-[11px] text-slate-400 space-y-1">
              <div className="flex justify-between">
                <span>Room:</span>
                <span className="text-slate-200 font-mono font-semibold truncate max-w-[120px]">{room}</span>
              </div>
              <div className="flex justify-between">
                <span>Active Language:</span>
                <span className="text-blue-400 font-semibold uppercase text-[10px]">{language}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Monaco Editor Canvas */}
        <section className="flex-1 h-full bg-[#1e1e1e] relative">
          <Editor
            height="100%"
            language={language}
            theme={theme}
            defaultValue={
              SUPPORTED_LANGUAGES.find((l) => l.id === language)?.defaultSnippet ||
              "// Start collaborative coding...\n"
            }
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              cursorBlinking: "smooth",
              smoothScrolling: true,
            }}
            onMount={handleMount}
          />
        </section>
      </div>
    </div>
  )
}

export default App
