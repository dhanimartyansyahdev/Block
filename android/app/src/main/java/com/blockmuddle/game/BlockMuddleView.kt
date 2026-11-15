package com.blockmuddle.game

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.random.Random

class BlockMuddleView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    interface GameEventListener {
        fun onPiecePickedUp()
        fun onPiecePlaced(result: PlacementResult)
        fun onInvalidDrop()
    }

    private data class Particle(
        var active: Boolean = false,
        var x: Float = 0f,
        var y: Float = 0f,
        var vx: Float = 0f,
        var vy: Float = 0f,
        var size: Float = 8f,
        var life: Float = 0f,
        var maxLife: Float = 0.5f,
        var color: Int = Color.YELLOW,
        var rotation: Float = 0f,
        var vRot: Float = 0f
    )

    private data class FloatingCallout(
        var active: Boolean = false,
        var text: String = "",
        var subText: String = "",
        var x: Float = 0f,
        var y: Float = 0f,
        var vy: Float = -120f,
        var life: Float = 0f,
        var maxLife: Float = 1.1f,
        var color: Int = Color.parseColor("#FBBF24")
    )

    private data class ClearingTile(
        var active: Boolean = false,
        var row: Int = 0,
        var col: Int = 0,
        var colorId: String = "amber",
        var progress: Float = 0f
    )

    private var engine: GameEngine? = null
    private var listener: GameEventListener? = null

    // Layout geometry
    private var boardX = 0f
    private var boardY = 0f
    private var boardSize = 0f
    private var cellSize = 0f
    private var cellGap = 0f
    private var boardInnerPad = 0f
    private var trayY = 0f
    private var trayHeight = 0f
    private var traySlotWidth = 0f
    private val trayCentersX = FloatArray(3)
    private var trayCenterY = 0f
    private var trayCellSize = 0f

    // Drag & touch offset state
    private var draggingIndex = -1
    private var dragX = 0f
    private var dragY = 0f
    private var touchOffsetY = 0f

    // Animation state
    private var lastFrameNanos = System.nanoTime()
    private var trauma = 0f
    private val traySpawnScale = FloatArray(3) { 1f }
    private val cellPopScale = Array(GameEngine.GRID_SIZE) { FloatArray(GameEngine.GRID_SIZE) { 1f } }

    // Pooled FX buffers (Zero allocation in onDraw)
    private val particlePool = Array(200) { Particle() }
    private var particleCursor = 0
    private val calloutPool = Array(10) { FloatingCallout() }
    private var calloutCursor = 0
    private val clearingPool = Array(64) { ClearingTile() }
    private var clearingCursor = 0

    // Reusable Paint & Rect objects
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val bevelPath = Path()
    private val rectF = RectF()

    private val calloutStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 10f
        color = Color.parseColor("#0B0F1A")
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private val calloutFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private val boardBgColor = Color.parseColor("#151E31")
    private val boardBorderColor = Color.parseColor("#2A364F")
    private val cellEvenColor = Color.parseColor("#1C263B")
    private val cellOddColor = Color.parseColor("#192236")
    private val trayBgColor = Color.parseColor("#131B2C")
    private val goldColor = Color.parseColor("#F59E0B")
    private val goldLightColor = Color.parseColor("#FDE68A")

    fun bind(engine: GameEngine, listener: GameEventListener) {
        this.engine = engine
        this.listener = listener
        animateTraySpawn()
        invalidate()
    }

    fun animateTraySpawn() {
        for (i in 0..2) traySpawnScale[i] = 0.2f
    }

    fun triggerReviveFX(clearedCells: List<ClearedCell>) {
        spawnClearEffects(clearedCells, 2, "REVIVED!", 0)
        animateTraySpawn()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0 || h <= 0) return

        val horizontalMargin = w * 0.05f
        val trayGap = h * 0.03f
        trayHeight = (h * 0.21f).coerceIn(180f, 340f)
        val availableHeight = h - trayHeight - trayGap - (h * 0.04f)
        boardSize = min(w - horizontalMargin * 2f, availableHeight)

        val totalHeight = boardSize + trayGap + trayHeight
        boardX = (w - boardSize) / 2f
        boardY = ((h - totalHeight) / 2f).coerceAtLeast(16f)

        boardInnerPad = boardSize * 0.025f
        cellGap = max(4f, boardSize * 0.01f)
        cellSize = (boardSize - boardInnerPad * 2f - cellGap * (GameEngine.GRID_SIZE - 1)) / GameEngine.GRID_SIZE

        trayY = boardY + boardSize + trayGap
        traySlotWidth = boardSize / 3f
        trayCentersX[0] = boardX + traySlotWidth * 0.5f
        trayCentersX[1] = boardX + traySlotWidth * 1.5f
        trayCentersX[2] = boardX + traySlotWidth * 2.5f
        trayCenterY = trayY + trayHeight / 2f
        trayCellSize = (cellSize * 0.52f).coerceIn(22f, 48f)

        // Vertical offset lifts the dragged piece cleanly above the player's thumb
        touchOffsetY = -(cellSize * 1.85f)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val game = engine ?: return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val x = event.x
                val y = event.y
                for (i in 0..2) {
                    if (game.tray[i] == null) continue
                    val cx = trayCentersX[i]
                    if (abs(x - cx) <= traySlotWidth * 0.5f &&
                        abs(y - trayCenterY) <= trayHeight * 0.55f
                    ) {
                        draggingIndex = i
                        dragX = x
                        dragY = y
                        listener?.onPiecePickedUp()
                        invalidate()
                        return true
                    }
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (draggingIndex != -1) {
                    dragX = event.x
                    dragY = event.y
                    invalidate()
                    return true
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (draggingIndex != -1) {
                    val idx = draggingIndex
                    val piece = game.tray[idx]
                    draggingIndex = -1
                    if (piece != null && event.actionMasked == MotionEvent.ACTION_UP) {
                        val snap = computeSnapPosition(piece, event.x, event.y + touchOffsetY)
                        if (snap != null) {
                            val result = game.placePiece(idx, snap.first, snap.second)
                            if (result != null) {
                                for ((r, c) in result.placedCells) {
                                    cellPopScale[r][c] = 0.5f
                                }
                                if (result.clearedCells.isNotEmpty() || result.calloutText != null) {
                                    val lines = result.clearedRows.size + result.clearedCols.size
                                    spawnClearEffects(
                                        result.clearedCells,
                                        lines,
                                        result.calloutText,
                                        result.pointsEarned
                                    )
                                }
                                if (game.tray.all { it != null }) {
                                    // Newly spawned set of 3
                                    animateTraySpawn()
                                }
                                listener?.onPiecePlaced(result)
                                invalidate()
                                return true
                            }
                        }
                    }
                    listener?.onInvalidDrop()
                    invalidate()
                    return true
                }
            }
        }
        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val game = engine ?: return

        val now = System.nanoTime()
        val dt = ((now - lastFrameNanos) / 1_000_000_000f).coerceIn(0f, 0.05f)
        lastFrameNanos = now

        val hasActiveAnimations = updateAnimations(dt)

        canvas.save()
        if (trauma > 0f) {
            val shake = trauma * trauma * 24f
            canvas.translate(
                (Random.nextFloat() * 2f - 1f) * shake,
                (Random.nextFloat() * 2f - 1f) * shake
            )
        }

        // Draw 8x8 board container
        val boardRadius = boardSize * 0.04f
        rectF.set(boardX, boardY, boardX + boardSize, boardY + boardSize)
        fillPaint.color = boardBgColor
        canvas.drawRoundRect(rectF, boardRadius, boardRadius, fillPaint)
        strokePaint.color = boardBorderColor
        strokePaint.strokeWidth = 3f
        canvas.drawRoundRect(rectF, boardRadius, boardRadius, strokePaint)

        val draggedPiece = if (draggingIndex in 0..2) game.tray[draggingIndex] else null
        val snapTarget = if (draggedPiece != null) {
            computeSnapPosition(draggedPiece, dragX, dragY + touchOffsetY)
        } else null
        val clearPreview = if (draggedPiece != null && snapTarget != null) {
            game.getClearPreview(draggedPiece, snapTarget.first, snapTarget.second)
        } else {
            ClearPreview(emptyList(), emptyList())
        }

        // Draw 8x8 cells
        val cellRadius = cellSize * 0.18f
        for (r in 0 until GameEngine.GRID_SIZE) {
            for (c in 0 until GameEngine.GRID_SIZE) {
                val x = getCellX(c)
                val y = getCellY(r)
                val willClear = r in clearPreview.rowsToClear || c in clearPreview.colsToClear

                rectF.set(x, y, x + cellSize, y + cellSize)
                fillPaint.color = if ((r + c) % 2 == 0) cellEvenColor else cellOddColor
                canvas.drawRoundRect(rectF, cellRadius, cellRadius, fillPaint)

                val colorId = game.grid[r][c]
                if (colorId != null) {
                    val scale = cellPopScale[r][c]
                    if (scale < 1f) {
                        canvas.save()
                        canvas.scale(scale, scale, x + cellSize / 2f, y + cellSize / 2f)
                        drawBevelBlock(canvas, x, y, cellSize, colorId, 255, willClear)
                        canvas.restore()
                    } else {
                        drawBevelBlock(canvas, x, y, cellSize, colorId, 255, willClear)
                    }
                } else if (willClear) {
                    rectF.set(x, y, x + cellSize, y + cellSize)
                    fillPaint.color = Color.argb(60, 245, 158, 11)
                    canvas.drawRoundRect(rectF, cellRadius, cellRadius, fillPaint)
                    strokePaint.color = goldLightColor
                    strokePaint.strokeWidth = 3f
                    canvas.drawRoundRect(rectF, cellRadius, cellRadius, strokePaint)
                }
            }
        }

        // Gold glow frame around rows & cols that will clear on drop
        if (clearPreview.rowsToClear.isNotEmpty() || clearPreview.colsToClear.isNotEmpty()) {
            strokePaint.color = goldLightColor
            strokePaint.strokeWidth = 5f
            val totalGridSpan = GameEngine.GRID_SIZE * cellSize + (GameEngine.GRID_SIZE - 1) * cellGap
            for (r in clearPreview.rowsToClear) {
                val y = getCellY(r)
                rectF.set(getCellX(0) - 3f, y - 3f, getCellX(0) + totalGridSpan + 3f, y + cellSize + 3f)
                canvas.drawRoundRect(rectF, cellRadius + 2f, cellRadius + 2f, strokePaint)
            }
            for (c in clearPreview.colsToClear) {
                val x = getCellX(c)
                rectF.set(x - 3f, getCellY(0) - 3f, x + cellSize + 3f, getCellY(0) + totalGridSpan + 3f)
                canvas.drawRoundRect(rectF, cellRadius + 2f, cellRadius + 2f, strokePaint)
            }
        }

        // Translucent Ghost Preview on grid
        if (draggedPiece != null && snapTarget != null) {
            val highlightGold = clearPreview.rowsToClear.isNotEmpty() || clearPreview.colsToClear.isNotEmpty()
            for (pr in 0 until draggedPiece.rows) {
                for (pc in 0 until draggedPiece.cols) {
                    if (draggedPiece.matrix[pr][pc] == 1) {
                        val gx = getCellX(snapTarget.second + pc)
                        val gy = getCellY(snapTarget.first + pr)
                        drawBevelBlock(canvas, gx, gy, cellSize, draggedPiece.colorId, 115, highlightGold)
                    }
                }
            }
        }

        // Shrinking cleared tiles
        for (tile in clearingPool) {
            if (!tile.active) continue
            val x = getCellX(tile.col)
            val y = getCellY(tile.row)
            val scale = (1f - tile.progress).coerceAtLeast(0.05f)
            val alpha = ((1f - tile.progress) * 255).roundToInt().coerceIn(0, 255)
            canvas.save()
            canvas.scale(scale, scale, x + cellSize / 2f, y + cellSize / 2f)
            drawBevelBlock(canvas, x, y, cellSize, tile.colorId, alpha, true)
            canvas.restore()
        }

        // Draw Bottom 3-Slot Tray Dock
        rectF.set(boardX, trayY, boardX + boardSize, trayY + trayHeight)
        fillPaint.color = trayBgColor
        canvas.drawRoundRect(rectF, boardRadius, boardRadius, fillPaint)
        strokePaint.color = boardBorderColor
        strokePaint.strokeWidth = 2.5f
        canvas.drawRoundRect(rectF, boardRadius, boardRadius, strokePaint)

        val trayGap = max(3f, trayCellSize * 0.14f)
        for (i in 0..2) {
            val piece = game.tray[i] ?: continue
            if (i == draggingIndex) continue

            val maxDim = max(piece.rows, piece.cols)
            val cSize = if (maxDim >= 5) trayCellSize * 0.78f else trayCellSize
            val pw = piece.cols * cSize + (piece.cols - 1) * trayGap
            val ph = piece.rows * cSize + (piece.rows - 1) * trayGap
            val scale = traySpawnScale[i]

            canvas.save()
            canvas.scale(scale, scale, trayCentersX[i], trayCenterY)
            val startX = trayCentersX[i] - pw / 2f
            val startY = trayCenterY - ph / 2f
            for (r in 0 until piece.rows) {
                for (c in 0 until piece.cols) {
                    if (piece.matrix[r][c] == 1) {
                        drawBevelBlock(
                            canvas,
                            startX + c * (cSize + trayGap),
                            startY + r * (cSize + trayGap),
                            cSize,
                            piece.colorId,
                            255,
                            false
                        )
                    }
                }
            }
            canvas.restore()
        }

        // Draw dragged piece floating at full size above finger
        if (draggedPiece != null) {
            val pw = draggedPiece.cols * cellSize + (draggedPiece.cols - 1) * cellGap
            val ph = draggedPiece.rows * cellSize + (draggedPiece.rows - 1) * cellGap
            val startX = dragX - pw / 2f
            val startY = dragY + touchOffsetY - ph / 2f
            for (r in 0 until draggedPiece.rows) {
                for (c in 0 until draggedPiece.cols) {
                    if (draggedPiece.matrix[r][c] == 1) {
                        drawBevelBlock(
                            canvas,
                            startX + c * (cellSize + cellGap),
                            startY + r * (cellSize + cellGap),
                            cellSize,
                            draggedPiece.colorId,
                            245,
                            false
                        )
                    }
                }
            }
        }

        // Pooled particles
        for (p in particlePool) {
            if (!p.active) continue
            val t = p.life / p.maxLife
            val alpha = ((1f - t) * 255).roundToInt().coerceIn(0, 255)
            val s = p.size * (1f - t * 0.45f)
            canvas.save()
            canvas.translate(p.x, p.y)
            canvas.rotate(p.rotation)
            fillPaint.color = p.color
            fillPaint.alpha = alpha
            rectF.set(-s / 2f, -s / 2f, s / 2f, s / 2f)
            canvas.drawRoundRect(rectF, 4f, 4f, fillPaint)
            fillPaint.alpha = 255
            canvas.restore()
        }

        // Floating combo callouts
        for (c in calloutPool) {
            if (!c.active) continue
            val t = c.life / c.maxLife
            val alpha = if (t < 0.2f) (t / 0.2f * 255).roundToInt() else ((1f - (t - 0.2f) / 0.8f) * 255).roundToInt()
            val textSize = max(44f, boardSize * 0.082f)
            calloutStrokePaint.textSize = textSize
            calloutFillPaint.textSize = textSize
            calloutFillPaint.color = c.color
            calloutStrokePaint.alpha = alpha.coerceIn(0, 255)
            calloutFillPaint.alpha = alpha.coerceIn(0, 255)

            canvas.drawText(c.text, c.x, c.y, calloutStrokePaint)
            canvas.drawText(c.text, c.x, c.y, calloutFillPaint)

            if (c.subText.isNotEmpty()) {
                calloutStrokePaint.textSize = textSize * 0.62f
                calloutFillPaint.textSize = textSize * 0.62f
                calloutFillPaint.color = Color.WHITE
                canvas.drawText(c.subText, c.x, c.y + textSize * 0.78f, calloutStrokePaint)
                canvas.drawText(c.subText, c.x, c.y + textSize * 0.78f, calloutFillPaint)
            }
        }

        canvas.restore()

        if (hasActiveAnimations) {
            postInvalidateOnAnimation()
        }
    }

    private fun drawBevelBlock(
        canvas: Canvas,
        x: Float,
        y: Float,
        size: Float,
        colorId: String,
        alpha: Int,
        goldGlow: Boolean
    ) {
        val blockColor = BlockColor.fromId(colorId)
        val radius = max(6f, size * 0.18f)
        val bevel = max(4f, size * 0.13f)

        // Base fill
        rectF.set(x, y, x + size, y + size)
        fillPaint.color = if (goldGlow) goldColor else blockColor.baseColor
        fillPaint.alpha = alpha
        canvas.drawRoundRect(rectF, radius, radius, fillPaint)

        // Top-left bright bevel
        bevelPath.reset()
        bevelPath.moveTo(x + radius, y)
        bevelPath.lineTo(x + size - radius, y)
        bevelPath.lineTo(x + size - bevel, y + bevel)
        bevelPath.lineTo(x + bevel, y + bevel)
        bevelPath.lineTo(x + bevel, y + size - bevel)
        bevelPath.lineTo(x, y + size - radius)
        bevelPath.close()
        fillPaint.color = if (goldGlow) goldLightColor else blockColor.lightBevel
        fillPaint.alpha = alpha
        canvas.drawPath(bevelPath, fillPaint)

        // Bottom-right dark bevel
        bevelPath.reset()
        bevelPath.moveTo(x + size, y + radius)
        bevelPath.lineTo(x + size, y + size - radius)
        bevelPath.lineTo(x + radius, y + size)
        bevelPath.lineTo(x + bevel, y + size - bevel)
        bevelPath.lineTo(x + size - bevel, y + size - bevel)
        bevelPath.lineTo(x + size - bevel, y + bevel)
        bevelPath.close()
        fillPaint.color = if (goldGlow) Color.parseColor("#B45309") else blockColor.darkBevel
        fillPaint.alpha = alpha
        canvas.drawPath(bevelPath, fillPaint)

        // Inner jewel body + glossy highlight strip
        rectF.set(x + bevel, y + bevel, x + size - bevel, y + size - bevel)
        fillPaint.color = if (goldGlow) Color.parseColor("#FBBF24") else blockColor.baseColor
        fillPaint.alpha = alpha
        canvas.drawRoundRect(rectF, radius * 0.55f, radius * 0.55f, fillPaint)

        val innerSize = size - bevel * 2f
        if (innerSize > 6f) {
            rectF.set(
                x + bevel + innerSize * 0.1f,
                y + bevel + innerSize * 0.08f,
                x + bevel + innerSize * 0.9f,
                y + bevel + innerSize * 0.28f
            )
            fillPaint.color = Color.WHITE
            fillPaint.alpha = (alpha * 0.28f).roundToInt()
            canvas.drawRoundRect(rectF, innerSize * 0.1f, innerSize * 0.1f, fillPaint)
        }
        fillPaint.alpha = 255
    }

    private fun spawnClearEffects(
        clearedCells: List<ClearedCell>,
        linesCleared: Int,
        calloutText: String?,
        pointsEarned: Int
    ) {
        if (linesCleared >= 2) {
            trauma = min(1f, trauma + 0.35f + linesCleared * 0.14f)
        } else if (linesCleared == 1) {
            trauma = min(1f, trauma + 0.15f)
        }

        for (cell in clearedCells) {
            val tile = clearingPool[clearingCursor]
            clearingCursor = (clearingCursor + 1) % clearingPool.size
            tile.active = true
            tile.row = cell.row
            tile.col = cell.col
            tile.colorId = cell.colorId
            tile.progress = 0f

            val cx = getCellX(cell.col) + cellSize / 2f
            val cy = getCellY(cell.row) + cellSize / 2f
            val color = BlockColor.fromId(cell.colorId)
            val count = if (linesCleared >= 2) 7 else 5

            for (i in 0 until count) {
                val p = particlePool[particleCursor]
                particleCursor = (particleCursor + 1) % particlePool.size
                val angle = Random.nextFloat() * Math.PI.toFloat() * 2f
                val speed = 180f + Random.nextFloat() * 440f
                p.active = true
                p.x = cx
                p.y = cy
                p.vx = cos(angle) * speed
                p.vy = sin(angle) * speed - 80f
                p.size = 8f + Random.nextFloat() * 10f
                p.life = 0f
                p.maxLife = 0.42f + Random.nextFloat() * 0.25f
                p.color = if (i % 2 == 0) color.highlightColor else color.lightBevel
                p.rotation = Random.nextFloat() * 360f
                p.vRot = (Random.nextFloat() - 0.5f) * 360f
            }
        }

        if (calloutText != null || pointsEarned > 0) {
            val c = calloutPool[calloutCursor]
            calloutCursor = (calloutCursor + 1) % calloutPool.size
            c.active = true
            c.text = calloutText ?: "+$pointsEarned"
            c.subText = if (calloutText != null) "+$pointsEarned" else ""
            c.x = boardX + boardSize / 2f
            c.y = boardY + boardSize * 0.44f
            c.vy = -120f
            c.life = 0f
            c.maxLife = if (calloutText != null) 1.15f else 0.75f
            c.color = if (linesCleared >= 2) Color.parseColor("#FBBF24") else Color.parseColor("#34D399")
        }
    }

    private fun updateAnimations(dt: Float): Boolean {
        var active = false

        if (trauma > 0f) {
            trauma = max(0f, trauma - dt * 2.4f)
            active = true
        }
        for (i in 0..2) {
            if (traySpawnScale[i] < 1f) {
                traySpawnScale[i] = min(1f, traySpawnScale[i] + dt * 5.2f)
                active = true
            }
        }
        for (r in 0 until GameEngine.GRID_SIZE) {
            for (c in 0 until GameEngine.GRID_SIZE) {
                if (cellPopScale[r][c] < 1f) {
                    cellPopScale[r][c] = min(1f, cellPopScale[r][c] + dt * 6.5f)
                    active = true
                }
            }
        }
        for (p in particlePool) {
            if (!p.active) continue
            p.life += dt
            if (p.life >= p.maxLife) {
                p.active = false
            } else {
                p.vy += 850f * dt
                p.x += p.vx * dt
                p.y += p.vy * dt
                p.rotation += p.vRot * dt
                active = true
            }
        }
        for (t in clearingPool) {
            if (!t.active) continue
            t.progress += dt * 4.2f
            if (t.progress >= 1f) t.active = false else active = true
        }
        for (c in calloutPool) {
            if (!c.active) continue
            c.life += dt
            if (c.life >= c.maxLife) {
                c.active = false
            } else {
                c.y += c.vy * dt
                c.vy *= 0.94f
                active = true
            }
        }
        return active
    }

    private fun computeSnapPosition(piece: TrayPiece, centerX: Float, centerY: Float): Pair<Int, Int>? {
        val game = engine ?: return null
        val step = cellSize + cellGap
        val pw = piece.cols * cellSize + (piece.cols - 1) * cellGap
        val ph = piece.rows * cellSize + (piece.rows - 1) * cellGap
        val topLeftX = centerX - pw / 2f
        val topLeftY = centerY - ph / 2f

        val col = floor(((topLeftX - getCellX(0)) / step) + 0.5f).toInt()
        val row = floor(((topLeftY - getCellY(0)) / step) + 0.5f).toInt()

        return if (game.canPlacePiece(piece, row, col)) row to col else null
    }

    private fun getCellX(col: Int): Float = boardX + boardInnerPad + col * (cellSize + cellGap)
    private fun getCellY(row: Int): Float = boardY + boardInnerPad + row * (cellSize + cellGap)
}
