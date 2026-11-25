# Abstract Reasoning – 100 Levels Brain Challenge

A native Android puzzle game about visual pattern recognition, inductive reasoning and logical
deduction. 100 original levels in 10 chapters, drawn entirely as vector graphics from structured
data, and checked automatically by an independent solver, so that each level has exactly one
defensible answer.

- **Install now:** `dist/AbstractReasoning-1.0.0-debug.apk` (debug-signed, Android 8.0+).
- **Stack:** Kotlin, Jetpack Compose, Material 3, MVVM, Coroutines/Flow, Navigation Compose,
  DataStore, Gradle Kotlin DSL, JUnit, Robolectric.
- Offline-first. No account, no network calls, no ads, no paid services.

## Project layout

```
abstract-reasoning/
├── puzzle/   Pure Kotlin/JVM module: domain, puzzle engine and content (no Android dependency)
│   ├── model/       Element, Figure, Puzzle, PuzzleBody (6 formats), Chapter
│   ├── geometry/    Shape outlines (single source for rendering and comparison), visual identity
│   ├── engine/      Whole-figure transformations (rotate, mirror, swap colours, move, add, remove…)
│   ├── solver/      Feature extraction and hypothesis solvers used for validation
│   ├── validation/  PuzzleValidator: metadata, rendering, uniqueness and catalogue checks
│   ├── content/     DSL plus Chapter01..Chapter10 (the 100 levels) and PuzzleCatalog
│   └── game/        Scoring (stars), GameProgress (unlocking, stats), ProgressCodec
└── app/      Android application
    ├── data/        DataStore repositories (progress, settings), PuzzleRepository abstraction
    ├── feedback/    Synthesised sound effects (no audio files), haptics
    └── ui/
        ├── theme/       Palette, typography, light/dark schemes, puzzle inks
        ├── render/      FigureCanvas: Compose Canvas vector renderer + screen-reader descriptions
        ├── components/  Buttons, cards, progress bar/ring, stars, difficulty badge, dialogs, logo, step glyphs
        ├── navigation/  Navigation Compose graph
        └── screens/     home, levels (map), puzzle, results, stats, settings, about
```

The puzzle module has no Android dependency, so the whole engine and all 100 levels are tested on
the JVM in seconds.

## Building

Requirements: JDK 17 or newer, and the Android SDK with platform 35 and build-tools 35. Android Studio
Ladybug or newer opens the project directly.

```bash
cd abstract-reasoning
echo "sdk.dir=/path/to/Android/sdk" > local.properties   # Android Studio writes this for you
./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
./gradlew test                 # all unit tests (puzzle engine + Robolectric UI tests)
```

Install on a device with `adb install -r app/build/outputs/apk/debug/app-debug.apk`, or copy the APK
to the phone and open it (allow installation from that source).

### Useful development tasks

```bash
# Validation report for every level (prints the solver's reasoning for failing levels)
./gradlew :puzzle:test --tests '*ContentReport*' --rerun -Dlevels=12,40

# Render levels to PNG contact sheets (answer highlighted) for visual review
./gradlew :puzzle:test --tests '*SheetRenderer*' --rerun -Dsheets=/tmp/sheets

# Screenshots of real app screens (light/dark, small screen, large text) via Robolectric
./gradlew :app:testDebugUnitTest -Dscreenshots=/tmp/shots
```

The Robolectric tests resolve the Android runtime jar through Gradle, from Google's mirror of Maven
Central (see `settings.gradle.kts`), and run offline.

## Game design

| Chapter | Theme | Levels |
|---|---|---|
| 1 | Visual Foundations: shape, colour, size, count, rotation | 1–10 |
| 2 | Sequences & Transformations: direction of rotation, positions, two simple rules | 11–20 |
| 3 | Spatial Reasoning: mirrors, symmetry, orientation, movement on a board | 21–30 |
| 4 | Logical Matrices: 2×2 and 3×3 grids, row and column rules, Latin squares, overlays | 31–40 |
| 5 | Multiple Rules: independent attributes, alternating changes, logical intersections | 41–50 |
| 6 | Complex Transformations: superposition, subtraction, XOR, nesting, cycles | 51–60 |
| 7 | Advanced Induction: hidden links, non-linear growth, recursive sequences, matrix algebra | 61–70 |
| 8 | Abstract Logic: symbolic mapping, multi-step programs, lagged dependencies | 71–80 |
| 9 | Expert Challenges: three or four rules, irregular rhythms, spatial composites | 81–90 |
| 10 | Mastermind: interacting rules and long deductions | 91–100 |

All six question formats appear throughout: sequence completion, missing matrix, transformation
logic, odd one out, visual relationship (figure analogies and named-rule questions), and multi-rule
deduction ("these figures follow the rules, these break one; which option follows them?").
Difficulty comes from logical complexity (more interacting rules, non-linear progressions,
cross-attribute relations), not from smaller or noisier shapes.

**Stars:**
- 3 stars: correct within the target time, with no hint and no wrong attempt.
- 2 stars: correct with one assist (a hint or a wrong attempt), or within twice the target time.
- 1 star: correct otherwise.

A wrong answer never blocks the game. The player can retry, or reveal the solution; revealing
completes the level with 0 stars and unlocks the next one. The best result for each level is kept.

**Tracked statistics:**
- Levels completed and correct answers.
- Accuracy and average solving time.
- Total stars and perfect levels.
- Best chapter and personal best times.

## Puzzle quality control

Every level is defined in code through the content DSL: figures are generated by the same rules
that define the answer, and distractors are deliberate near-misses (wrong turn, wrong order, wrong
count, wrong colour…). `PuzzleValidator`, run by `CatalogValidationTest`, then checks each level
independently.

**Metadata.** Every level has an id, title, prompt, explanation, 1–3 hints, a difficulty from 1 to
10 and a target time.

**Options.** There are 4 or 5 options, the correct index is valid, and no two options look alike.
"Look alike" is decided from appearance, not data: a square turned 90° *is* the same square, and a
mirrored arrow is the same arrow.

**Rendering.** Every element fits inside its cell.

**Rules reproduce the answer.** For transformation, analogy and rule questions, the stated steps or
rule are applied again and must produce the marked answer.

**Exactly one valid answer.** An independent solver reads only what the player can see and lists
every simple rule consistent with it:
- constant, repeating cycle, arithmetic, accelerating, interleaved, geometric and Fibonacci
  progressions;
- Latin squares, row and column tables, sums and differences;
- set union, XOR, difference and intersection;
- cross-attribute relations ("dots = sides"), and lagged rules ("follows the leader");
- symmetry and relational properties;
- a library of about 3,000 composite transformations.

An option counts as a valid answer only if some consistent rule produces it. The level passes only
when that set is exactly the marked answer. During development the solver rejected several drafts
whose second reading was defensible, and those levels were redesigned.

**Catalogue.** The catalogue must have:
- exactly 100 levels in 10 chapters;
- no duplicate puzzles;
- average difficulty that never decreases from one chapter to the next;
- all six formats used regularly;
- a balanced spread of answer positions.

No level is exempt from the solver.

## Accessibility

- Every figure has a spoken description, e.g. "large navy solid flag, turned 90° clockwise".
- Options announce selected, correct and incorrect states.
- Puzzle inks differ in lightness, not only hue. An optional **colour assist** mode prints a letter
  (N, T, G, C) inside each coloured shape.
- Difficulty is shown with bars and a word, never colour alone.
- Touch targets are at least 48 dp, and text uses `sp` units, so it scales with the system font size.

## Settings

- Interface language: system, English or French. Puzzle prompts, hints and explanations are
  English only for now.
- Sound effects and haptic feedback.
- Light, dark or system theme.
- Show or hide the timer.
- Colour assist.
- Reset progress, with confirmation.
- About.

## Ready for future features

- `PuzzleRepository` separates content from the app, so daily challenges, puzzle packs or
  generated assessments can plug in without UI changes.
- `GameProgress` and `ProgressCodec` are versioned and decode corrupt data safely, which leaves room
  for migrations and later optional cloud sync.
- The puzzle DSL and validator make new content cheap to add safely: write a level, run the tests.
