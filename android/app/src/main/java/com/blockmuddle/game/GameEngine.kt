package com.blockmuddle.game

import android.content.Context
import com.google.gson.Gson
import kotlin.math.max
import kotlin.random.Random

class GameEngine(private val context: Context) {

    companion object {
        const val GRID_SIZE = 8
        private const val PREFS_NAME = "block_muddle_prefs"
        private const val KEY_SAVED_STATE = "saved_game_state_json"
        private const val KEY_HIGH_SCORE = "high_score"
    }

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    val grid: Array<Array<String?>> = Array(GRID_SIZE) { arrayOfNulls(GRID_SIZE) }
    val tray: Array<TrayPiece?> = arrayOfNulls(3)

    var score: Int = 0
        private set
    var highScore: Int = prefs.getInt(KEY_HIGH_SCORE, 0)
        private set
    var comboStreak: Int = 0
        private set
    var reviveUsed: Boolean = false
        private set

    fun startNewGame() {
        for (r in 0 until GRID_SIZE) {
            for (c in 0 until GRID_SIZE) {
                grid[r][c] = null
            }
        }
        score = 0
        comboStreak = 0
        reviveUsed = false
        spawnTray(easyOnly = false)
        saveState()
    }

    fun restoreSavedGameOrStartNew(): Boolean {
        val json = prefs.getString(KEY_SAVED_STATE, null)
        if (json.isNullOrEmpty()) {
            startNewGame()
            return false
        }

        return try {
            val saved = gson.fromJson(json, SavedGameState::class.java)
            if (saved.grid.size != GRID_SIZE || saved.tray.size != 3) {
                startNewGame()
                false
            } else {
                for (r in 0 until GRID_SIZE) {
                    for (c in 0 until GRID_SIZE) {
                        grid[r][c] = saved.grid[r][c]
                    }
                }
                for (i in 0 until 3) {
                    tray[i] = saved.tray[i]
                }
                score = saved.score
                highScore = max(prefs.getInt(KEY_HIGH_SCORE, 0), saved.highScore)
                comboStreak = saved.comboStreak
                reviveUsed = saved.reviveUsed

                if (tray.all { it == null }) {
                    spawnTray(easyOnly = false)
                }
                true
            }
        } catch (_: Exception) {
            startNewGame()
            false
        }
    }

    fun saveState() {
        val gridCopy = List(GRID_SIZE) { r ->
            List(GRID_SIZE) { c -> grid[r][c] }
        }
        val state = SavedGameState(
            grid = gridCopy,
            tray = tray.toList(),
            score = score,
            highScore = highScore,
            comboStreak = comboStreak,
            reviveUsed = reviveUsed
        )
        prefs.edit()
            .putString(KEY_SAVED_STATE, gson.toJson(state))
            .putInt(KEY_HIGH_SCORE, highScore)
            .apply()
    }

    fun canPlacePiece(piece: TrayPiece, startRow: Int, startCol: Int): Boolean {
        if (startRow < 0 || startCol < 0 ||
            startRow + piece.rows > GRID_SIZE ||
            startCol + piece.cols > GRID_SIZE
        ) {
            return false
        }
        for (r in 0 until piece.rows) {
            for (c in 0 until piece.cols) {
                if (piece.matrix[r][c] == 1 && grid[startRow + r][startCol + c] != null) {
                    return false
                }
            }
        }
        return true
    }

    fun getClearPreview(piece: TrayPiece, startRow: Int, startCol: Int): ClearPreview {
        if (!canPlacePiece(piece, startRow, startCol)) {
            return ClearPreview(emptyList(), emptyList())
        }

        val sim = Array(GRID_SIZE) { r -> Array(GRID_SIZE) { c -> grid[r][c] != null } }
        for (r in 0 until piece.rows) {
            for (c in 0 until piece.cols) {
                if (piece.matrix[r][c] == 1) {
                    sim[startRow + r][startCol + c] = true
                }
            }
        }

        val rowsToClear = mutableListOf<Int>()
        val colsToClear = mutableListOf<Int>()

        for (r in 0 until GRID_SIZE) {
            if ((0 until GRID_SIZE).all { c -> sim[r][c] }) {
                rowsToClear.add(r)
            }
        }
        for (c in 0 until GRID_SIZE) {
            if ((0 until GRID_SIZE).all { r -> sim[r][c] }) {
                colsToClear.add(c)
            }
        }
        return ClearPreview(rowsToClear, colsToClear)
    }

    fun placePiece(trayIndex: Int, startRow: Int, startCol: Int): PlacementResult? {
        if (trayIndex !in 0..2) return null
        val piece = tray[trayIndex] ?: return null
        if (!canPlacePiece(piece, startRow, startCol)) return null

        val placedCells = mutableListOf<Pair<Int, Int>>()
        for (r in 0 until piece.rows) {
            for (c in 0 until piece.cols) {
                if (piece.matrix[r][c] == 1) {
                    grid[startRow + r][startCol + c] = piece.colorId
                    placedCells.add((startRow + r) to (startCol + c))
                }
            }
        }
        tray[trayIndex] = null

        val clearedRows = mutableListOf<Int>()
        val clearedCols = mutableListOf<Int>()

        for (r in 0 until GRID_SIZE) {
            if ((0 until GRID_SIZE).all { c -> grid[r][c] != null }) {
                clearedRows.add(r)
            }
        }
        for (c in 0 until GRID_SIZE) {
            if ((0 until GRID_SIZE).all { r -> grid[r][c] != null }) {
                clearedCols.add(c)
            }
        }

        val clearedMap = linkedMapOf<Pair<Int, Int>, ClearedCell>()
        for (r in clearedRows) {
            for (c in 0 until GRID_SIZE) {
                val color = grid[r][c]
                if (color != null) {
                    clearedMap[r to c] = ClearedCell(r, c, color)
                }
            }
        }
        for (c in clearedCols) {
            for (r in 0 until GRID_SIZE) {
                val color = grid[r][c]
                if (color != null) {
                    clearedMap[r to c] = ClearedCell(r, c, color)
                }
            }
        }

        for (cell in clearedMap.values) {
            grid[cell.row][cell.col] = null
        }

        val linesCleared = clearedRows.size + clearedCols.size
        comboStreak = if (linesCleared > 0) comboStreak + 1 else 0

        val placementPoints = placedCells.size * 10
        val lineBonus = if (linesCleared > 0) {
            100 * (linesCleared * linesCleared) * max(1, comboStreak)
        } else {
            0
        }
        val boardEmpty = linesCleared > 0 && countOccupiedCells() == 0
        val perfectBonus = if (boardEmpty) 500 else 0
        val pointsEarned = placementPoints + lineBonus + perfectBonus

        score += pointsEarned
        if (score > highScore) {
            highScore = score
        }

        val calloutText = when {
            boardEmpty -> "PERFECT CLEAR!"
            linesCleared >= 4 -> "MUDDLE BLAST!"
            linesCleared == 3 -> if (comboStreak >= 2) "TRIPLE COMBO x$comboStreak!" else "MUDDLE BLAST!"
            linesCleared == 2 -> if (comboStreak >= 2) "COMBO x$comboStreak!" else "GREAT!"
            linesCleared == 1 && comboStreak >= 3 -> "STREAK x$comboStreak!"
            linesCleared == 1 && comboStreak == 2 -> "COMBO x2!"
            else -> null
        }

        if (tray.all { it == null }) {
            spawnTray(easyOnly = false)
        }

        val isGameOver = !hasAnyValidMove()
        saveState()

        return PlacementResult(
            placedCells = placedCells,
            clearedRows = clearedRows,
            clearedCols = clearedCols,
            clearedCells = clearedMap.values.toList(),
            pointsEarned = pointsEarned,
            newComboStreak = comboStreak,
            calloutText = calloutText,
            isGameOver = isGameOver
        )
    }

    fun hasAnyValidMove(): Boolean {
        for (piece in tray) {
            if (piece != null && canPieceFitAnywhere(piece)) {
                return true
            }
        }
        return false
    }

    fun rerollTrayWithEasyPieces() {
        spawnTray(easyOnly = true)
        saveState()
    }

    fun applyReviveCenterClear(): List<ClearedCell> {
        reviveUsed = true
        val cleared = mutableListOf<ClearedCell>()
        for (r in 2..5) {
            for (c in 2..5) {
                val existing = grid[r][c]
                if (existing != null) {
                    cleared.add(ClearedCell(r, c, existing))
                    grid[r][c] = null
                }
            }
        }

        val oneByOne = PolyominoCatalog.ALL_TEMPLATES.first { it.id == "1x1" }
        for (i in 0 until 3) {
            tray[i] = createPiece(oneByOne)
        }
        saveState()
        return cleared
    }

    private fun spawnTray(easyOnly: Boolean) {
        val pool = if (easyOnly) {
            PolyominoCatalog.ALL_TEMPLATES.filter { it.easy }
        } else {
            PolyominoCatalog.ALL_TEMPLATES
        }

        val occupiedRatio = countOccupiedCells().toFloat() / (GRID_SIZE * GRID_SIZE)
        val fittingTemplates = pool.filter { canTemplateFitAnywhere(it) }
        val easyFitting = PolyominoCatalog.ALL_TEMPLATES.filter { it.easy && canTemplateFitAnywhere(it) }

        for (i in 0 until 3) {
            val chosen = when {
                i == 0 && fittingTemplates.isNotEmpty() && (occupiedRatio >= 0.35f || easyOnly) -> {
                    val source = if (occupiedRatio >= 0.55f && easyFitting.isNotEmpty()) easyFitting else fittingTemplates
                    pickWeighted(source)
                }
                occupiedRatio >= 0.60f && easyFitting.isNotEmpty() -> pickWeighted(easyFitting)
                else -> pickWeighted(pool)
            }
            tray[i] = createPiece(chosen)
        }

        if (!hasAnyValidMove() && fittingTemplates.isNotEmpty()) {
            val fallback = if (easyFitting.isNotEmpty()) pickWeighted(easyFitting) else pickWeighted(fittingTemplates)
            tray[0] = createPiece(fallback)
        }
    }

    private fun canTemplateFitAnywhere(template: PieceTemplate): Boolean {
        for (r in 0..(GRID_SIZE - template.rows)) {
            for (c in 0..(GRID_SIZE - template.cols)) {
                var fits = true
                for (pr in 0 until template.rows) {
                    for (pc in 0 until template.cols) {
                        if (template.matrix[pr][pc] == 1 && grid[r + pr][c + pc] != null) {
                            fits = false
                            break
                        }
                    }
                    if (!fits) break
                }
                if (fits) return true
            }
        }
        return false
    }

    private fun canPieceFitAnywhere(piece: TrayPiece): Boolean {
        for (r in 0..(GRID_SIZE - piece.rows)) {
            for (c in 0..(GRID_SIZE - piece.cols)) {
                if (canPlacePiece(piece, r, c)) return true
            }
        }
        return false
    }

    private fun countOccupiedCells(): Int {
        var count = 0
        for (r in 0 until GRID_SIZE) {
            for (c in 0 until GRID_SIZE) {
                if (grid[r][c] != null) count++
            }
        }
        return count
    }

    private fun pickWeighted(templates: List<PieceTemplate>): PieceTemplate {
        val total = templates.sumOf { it.weight }
        var roll = Random.nextInt(total)
        for (t in templates) {
            roll -= t.weight
            if (roll < 0) return t
        }
        return templates.first()
    }

    private fun createPiece(template: PieceTemplate): TrayPiece {
        val color = BlockColor.entries[Random.nextInt(BlockColor.entries.size)]
        val matrixList = template.matrix.map { row -> row.toList() }
        return TrayPiece(template.id, matrixList, color.colorId)
    }
}
