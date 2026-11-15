package com.blockmuddle.game

import android.graphics.Color

enum class BlockColor(
    val colorId: String,
    val baseColor: Int,
    val lightBevel: Int,
    val darkBevel: Int,
    val highlightColor: Int
) {
    SAPPHIRE(
        "sapphire",
        Color.parseColor("#3B82F6"),
        Color.parseColor("#60A5FA"),
        Color.parseColor("#1D4ED8"),
        Color.parseColor("#BFDBFE")
    ),
    RUBY(
        "ruby",
        Color.parseColor("#EF4444"),
        Color.parseColor("#F87171"),
        Color.parseColor("#B91C1C"),
        Color.parseColor("#FECACA")
    ),
    EMERALD(
        "emerald",
        Color.parseColor("#10B981"),
        Color.parseColor("#34D399"),
        Color.parseColor("#047857"),
        Color.parseColor("#A7F3D0")
    ),
    AMBER(
        "amber",
        Color.parseColor("#F59E0B"),
        Color.parseColor("#FBBF24"),
        Color.parseColor("#B45309"),
        Color.parseColor("#FDE68A")
    ),
    AMETHYST(
        "amethyst",
        Color.parseColor("#8B5CF6"),
        Color.parseColor("#A78BFA"),
        Color.parseColor("#6D28D9"),
        Color.parseColor("#DDD6FE")
    ),
    CYAN(
        "cyan",
        Color.parseColor("#06B6D4"),
        Color.parseColor("#22D3EE"),
        Color.parseColor("#0E7490"),
        Color.parseColor("#A5F3FC")
    ),
    TANGERINE(
        "tangerine",
        Color.parseColor("#F97316"),
        Color.parseColor("#FB923C"),
        Color.parseColor("#C2410C"),
        Color.parseColor("#FED7AA")
    );

    companion object {
        fun fromId(id: String?): BlockColor {
            return entries.firstOrNull { it.colorId == id } ?: SAPPHIRE
        }
    }
}

data class PieceTemplate(
    val id: String,
    val matrix: Array<IntArray>,
    val weight: Int,
    val easy: Boolean
) {
    val rows: Int get() = matrix.size
    val cols: Int get() = if (matrix.isNotEmpty()) matrix[0].size else 0
}

object PolyominoCatalog {
    val ALL_TEMPLATES: List<PieceTemplate> = listOf(
        // 1x1 & Lines
        PieceTemplate("1x1", arrayOf(intArrayOf(1)), 6, true),
        PieceTemplate("1x2", arrayOf(intArrayOf(1, 1)), 8, true),
        PieceTemplate("2x1", arrayOf(intArrayOf(1), intArrayOf(1)), 8, true),
        PieceTemplate("1x3", arrayOf(intArrayOf(1, 1, 1)), 7, true),
        PieceTemplate("3x1", arrayOf(intArrayOf(1), intArrayOf(1), intArrayOf(1)), 7, true),
        PieceTemplate("1x4", arrayOf(intArrayOf(1, 1, 1, 1)), 5, false),
        PieceTemplate("4x1", arrayOf(intArrayOf(1), intArrayOf(1), intArrayOf(1), intArrayOf(1)), 5, false),
        PieceTemplate("1x5", arrayOf(intArrayOf(1, 1, 1, 1, 1)), 3, false),
        PieceTemplate("5x1", arrayOf(intArrayOf(1), intArrayOf(1), intArrayOf(1), intArrayOf(1), intArrayOf(1)), 3, false),

        // Squares
        PieceTemplate("2x2", arrayOf(intArrayOf(1, 1), intArrayOf(1, 1)), 9, true),
        PieceTemplate("3x3", arrayOf(intArrayOf(1, 1, 1), intArrayOf(1, 1, 1), intArrayOf(1, 1, 1)), 3, false),

        // 2x2 Mini Corners
        PieceTemplate("c3_tl", arrayOf(intArrayOf(1, 1), intArrayOf(1, 0)), 6, true),
        PieceTemplate("c3_tr", arrayOf(intArrayOf(1, 1), intArrayOf(0, 1)), 6, true),
        PieceTemplate("c3_bl", arrayOf(intArrayOf(1, 0), intArrayOf(1, 1)), 6, true),
        PieceTemplate("c3_br", arrayOf(intArrayOf(0, 1), intArrayOf(1, 1)), 6, true),

        // L-Shapes
        PieceTemplate("L_up", arrayOf(intArrayOf(1, 0), intArrayOf(1, 0), intArrayOf(1, 1)), 5, false),
        PieceTemplate("L_right", arrayOf(intArrayOf(1, 1, 1), intArrayOf(1, 0, 0)), 5, false),
        PieceTemplate("L_down", arrayOf(intArrayOf(1, 1), intArrayOf(0, 1), intArrayOf(0, 1)), 5, false),
        PieceTemplate("L_left", arrayOf(intArrayOf(0, 0, 1), intArrayOf(1, 1, 1)), 5, false),

        // J-Shapes
        PieceTemplate("J_up", arrayOf(intArrayOf(0, 1), intArrayOf(0, 1), intArrayOf(1, 1)), 5, false),
        PieceTemplate("J_right", arrayOf(intArrayOf(1, 0, 0), intArrayOf(1, 1, 1)), 5, false),
        PieceTemplate("J_down", arrayOf(intArrayOf(1, 1), intArrayOf(1, 0), intArrayOf(1, 0)), 5, false),
        PieceTemplate("J_left", arrayOf(intArrayOf(1, 1, 1), intArrayOf(0, 0, 1)), 5, false),

        // T-Shapes
        PieceTemplate("T_up", arrayOf(intArrayOf(0, 1, 0), intArrayOf(1, 1, 1)), 5, false),
        PieceTemplate("T_down", arrayOf(intArrayOf(1, 1, 1), intArrayOf(0, 1, 0)), 5, false),
        PieceTemplate("T_right", arrayOf(intArrayOf(1, 0), intArrayOf(1, 1), intArrayOf(1, 0)), 4, false),
        PieceTemplate("T_left", arrayOf(intArrayOf(0, 1), intArrayOf(1, 1), intArrayOf(0, 1)), 4, false),

        // Z & S Shapes
        PieceTemplate("Z_h", arrayOf(intArrayOf(1, 1, 0), intArrayOf(0, 1, 1)), 4, false),
        PieceTemplate("Z_v", arrayOf(intArrayOf(0, 1), intArrayOf(1, 1), intArrayOf(1, 0)), 4, false),
        PieceTemplate("S_h", arrayOf(intArrayOf(0, 1, 1), intArrayOf(1, 1, 0)), 4, false),
        PieceTemplate("S_v", arrayOf(intArrayOf(1, 0), intArrayOf(1, 1), intArrayOf(0, 1)), 4, false)
    )
}

data class TrayPiece(
    val templateId: String,
    val matrix: List<List<Int>>,
    val colorId: String
) {
    val rows: Int get() = matrix.size
    val cols: Int get() = if (matrix.isNotEmpty()) matrix[0].size else 0
}

data class ClearedCell(
    val row: Int,
    val col: Int,
    val colorId: String
)

data class ClearPreview(
    val rowsToClear: List<Int>,
    val colsToClear: List<Int>
)

data class PlacementResult(
    val placedCells: List<Pair<Int, Int>>,
    val clearedRows: List<Int>,
    val clearedCols: List<Int>,
    val clearedCells: List<ClearedCell>,
    val pointsEarned: Int,
    val newComboStreak: Int,
    val calloutText: String?,
    val isGameOver: Boolean
)

data class SavedGameState(
    val grid: List<List<String?>>,
    val tray: List<TrayPiece?>,
    val score: Int,
    val highScore: Int,
    val comboStreak: Int,
    val reviveUsed: Boolean
)
