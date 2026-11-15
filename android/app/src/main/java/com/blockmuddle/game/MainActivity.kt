package com.blockmuddle.game

import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.view.View
import android.view.Window
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.blockmuddle.game.databinding.ActivityMainBinding
import com.blockmuddle.game.databinding.DialogGameOverBinding
import com.blockmuddle.game.databinding.DialogPauseBinding

class MainActivity : AppCompatActivity(), BlockMuddleView.GameEventListener {

    private lateinit var binding: ActivityMainBinding
    private lateinit var gameEngine: GameEngine
    private lateinit var soundAndHaptics: SoundAndHapticManager

    private var pauseDialog: Dialog? = null
    private var gameOverDialog: Dialog? = null
    private var previousBestBeforeRun = 0

    private val adAvailabilityListener: (Boolean) -> Unit = { ready ->
        updateAdButtonStates(ready)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        gameEngine = GameEngine(this)
        soundAndHaptics = SoundAndHapticManager(this)
        AdManager.initialize(this)
        AdManager.addAvailabilityListener(adAvailabilityListener)

        val restored = gameEngine.restoreSavedGameOrStartNew()
        previousBestBeforeRun = gameEngine.highScore

        binding.blockMuddleView.bind(gameEngine, this)
        setupMenuControls(hasSavedGame = restored && gameEngine.score > 0)
        setupHudControls()
        setupBackNavigation()
        refreshHud()
        showMainMenu()
    }

    private fun setupMenuControls(hasSavedGame: Boolean) {
        binding.btnPlay.text = if (hasSavedGame) getString(R.string.action_continue) else getString(R.string.action_play)
        binding.btnPlay.setOnClickListener {
            soundAndHaptics.playPickup()
            enterGameplay()
        }

        binding.btnNewRunMenu.isVisible = hasSavedGame
        binding.btnNewRunMenu.setOnClickListener {
            soundAndHaptics.playPickup()
            gameEngine.startNewGame()
            previousBestBeforeRun = gameEngine.highScore
            binding.blockMuddleView.animateTraySpawn()
            binding.blockMuddleView.invalidate()
            enterGameplay()
        }

        binding.btnMenuSound.setOnClickListener {
            soundAndHaptics.isSoundEnabled = !soundAndHaptics.isSoundEnabled
            syncAudioButtons()
            if (soundAndHaptics.isSoundEnabled) soundAndHaptics.playPickup()
        }

        binding.btnMenuHaptics.setOnClickListener {
            soundAndHaptics.isHapticsEnabled = !soundAndHaptics.isHapticsEnabled
            syncAudioButtons()
            soundAndHaptics.playPickup()
        }

        syncAudioButtons()
    }

    private fun setupHudControls() {
        binding.btnPause.setOnClickListener {
            soundAndHaptics.playPickup()
            showPauseDialog()
        }

        binding.btnRerollAd.setOnClickListener {
            if (!AdManager.isAdReady() || !AdManager.isNetworkAvailable(this)) {
                Toast.makeText(this, getString(R.string.toast_no_ad_ready), Toast.LENGTH_SHORT).show()
                AdManager.preloadRewardedAd(this)
                return@setOnClickListener
            }

            AdManager.showRewardedAd(
                activity = this,
                onRewardEarned = {
                    gameEngine.rerollTrayWithEasyPieces()
                    soundAndHaptics.playPowerUp()
                    binding.blockMuddleView.animateTraySpawn()
                    binding.blockMuddleView.invalidate()
                    if (!gameEngine.hasAnyValidMove()) {
                        triggerGameOverFlow()
                    }
                },
                onAdNotReady = {
                    Toast.makeText(this, getString(R.string.toast_no_ad_ready), Toast.LENGTH_SHORT).show()
                }
            )
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    gameOverDialog?.isShowing == true -> {
                        gameOverDialog?.dismiss()
                        showMainMenu()
                    }
                    pauseDialog?.isShowing == true -> {
                        pauseDialog?.dismiss()
                    }
                    binding.gameplayContainer.isVisible -> {
                        showPauseDialog()
                    }
                    else -> {
                        finish()
                    }
                }
            }
        })
    }

    private fun showMainMenu() {
        binding.mainMenuContainer.visibility = View.VISIBLE
        binding.gameplayContainer.visibility = View.GONE
        binding.tvMenuHighScore.text = gameEngine.highScore.toString()
        val hasActiveProgress = gameEngine.score > 0
        binding.btnPlay.text = if (hasActiveProgress) getString(R.string.action_continue) else getString(R.string.action_play)
        binding.btnNewRunMenu.isVisible = hasActiveProgress
        syncAudioButtons()
    }

    private fun enterGameplay() {
        binding.mainMenuContainer.visibility = View.GONE
        binding.gameplayContainer.visibility = View.VISIBLE
        refreshHud()
        updateAdButtonStates(AdManager.isAdReady())
        if (!gameEngine.hasAnyValidMove()) {
            triggerGameOverFlow()
        }
    }

    private fun refreshHud() {
        binding.tvCurrentScore.text = gameEngine.score.toString()
        binding.tvBestScore.text = gameEngine.highScore.toString()
        if (gameEngine.comboStreak >= 2) {
            binding.tvComboBadge.visibility = View.VISIBLE
            binding.tvComboBadge.text = getString(R.string.combo_badge, gameEngine.comboStreak)
        } else {
            binding.tvComboBadge.visibility = View.GONE
        }
    }

    private fun syncAudioButtons() {
        val soundLabel = if (soundAndHaptics.isSoundEnabled) getString(R.string.sound_on) else getString(R.string.sound_off)
        val hapticLabel = if (soundAndHaptics.isHapticsEnabled) getString(R.string.haptics_on) else getString(R.string.haptics_off)
        binding.btnMenuSound.text = soundLabel
        binding.btnMenuHaptics.text = hapticLabel
        binding.btnMenuSound.alpha = if (soundAndHaptics.isSoundEnabled) 1f else 0.55f
        binding.btnMenuHaptics.alpha = if (soundAndHaptics.isHapticsEnabled) 1f else 0.55f
    }

    private fun updateAdButtonStates(adReady: Boolean) {
        val online = AdManager.isNetworkAvailable(this)
        val available = adReady && online
        binding.btnRerollAd.alpha = if (available) 1.0f else 0.48f
        binding.btnRerollAd.isEnabled = true // Keeps click listener active to show "No Ad Ready" toast
    }

    override fun onPiecePickedUp() {
        soundAndHaptics.playPickup()
    }

    override fun onInvalidDrop() {
        // Gentle feedback without jarring error
    }

    override fun onPiecePlaced(result: PlacementResult) {
        val linesCleared = result.clearedRows.size + result.clearedCols.size
        if (linesCleared > 0) {
            soundAndHaptics.playLineClear(result.newComboStreak)
        } else {
            soundAndHaptics.playDrop()
        }
        refreshHud()

        if (result.isGameOver) {
            binding.blockMuddleView.postDelayed({
                if (!isFinishing && !isDestroyed && !gameEngine.hasAnyValidMove()) {
                    triggerGameOverFlow()
                }
            }, 420L)
        }
    }

    private fun showPauseDialog() {
        if (pauseDialog?.isShowing == true) return
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val dlgBinding = DialogPauseBinding.inflate(layoutInflater)
        dialog.setContentView(dlgBinding.root)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        dialog.setCancelable(true)

        fun updatePauseToggles() {
            dlgBinding.btnPauseSound.text = if (soundAndHaptics.isSoundEnabled) getString(R.string.sound_on) else getString(R.string.sound_off)
            dlgBinding.btnPauseHaptics.text = if (soundAndHaptics.isHapticsEnabled) getString(R.string.haptics_on) else getString(R.string.haptics_off)
            dlgBinding.btnPauseSound.alpha = if (soundAndHaptics.isSoundEnabled) 1f else 0.55f
            dlgBinding.btnPauseHaptics.alpha = if (soundAndHaptics.isHapticsEnabled) 1f else 0.55f
        }
        updatePauseToggles()

        dlgBinding.btnResume.setOnClickListener {
            soundAndHaptics.playPickup()
            dialog.dismiss()
        }

        dlgBinding.btnRestart.setOnClickListener {
            soundAndHaptics.playPickup()
            dialog.dismiss()
            gameEngine.startNewGame()
            previousBestBeforeRun = gameEngine.highScore
            binding.blockMuddleView.animateTraySpawn()
            binding.blockMuddleView.invalidate()
            refreshHud()
        }

        dlgBinding.btnPauseSound.setOnClickListener {
            soundAndHaptics.isSoundEnabled = !soundAndHaptics.isSoundEnabled
            updatePauseToggles()
            syncAudioButtons()
            if (soundAndHaptics.isSoundEnabled) soundAndHaptics.playPickup()
        }

        dlgBinding.btnPauseHaptics.setOnClickListener {
            soundAndHaptics.isHapticsEnabled = !soundAndHaptics.isHapticsEnabled
            updatePauseToggles()
            syncAudioButtons()
            soundAndHaptics.playPickup()
        }

        dlgBinding.btnHome.setOnClickListener {
            soundAndHaptics.playPickup()
            dialog.dismiss()
            showMainMenu()
        }

        pauseDialog = dialog
        dialog.show()
    }

    private fun triggerGameOverFlow() {
        if (gameOverDialog?.isShowing == true) return
        soundAndHaptics.playGameOver()

        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val dlgBinding = DialogGameOverBinding.inflate(layoutInflater)
        dialog.setContentView(dlgBinding.root)
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        dialog.setCancelable(false)

        dlgBinding.tvFinalScore.text = gameEngine.score.toString()
        dlgBinding.tvGameOverBest.text = gameEngine.highScore.toString()

        val isNewBest = gameEngine.score > 0 && gameEngine.score >= gameEngine.highScore && gameEngine.score > previousBestBeforeRun
        dlgBinding.tvNewHighScoreBadge.isVisible = isNewBest

        val canRevive = !gameEngine.reviveUsed
        dlgBinding.btnReviveAd.isVisible = canRevive
        val adAvailable = AdManager.isAdReady() && AdManager.isNetworkAvailable(this)
        dlgBinding.btnReviveAd.alpha = if (adAvailable) 1.0f else 0.48f

        dlgBinding.btnReviveAd.setOnClickListener {
            if (!AdManager.isAdReady() || !AdManager.isNetworkAvailable(this)) {
                Toast.makeText(this, getString(R.string.toast_no_ad_ready), Toast.LENGTH_SHORT).show()
                AdManager.preloadRewardedAd(this)
                return@setOnClickListener
            }

            AdManager.showRewardedAd(
                activity = this,
                onRewardEarned = {
                    val cleared = gameEngine.applyReviveCenterClear()
                    dialog.dismiss()
                    soundAndHaptics.playPowerUp()
                    binding.blockMuddleView.triggerReviveFX(cleared)
                    binding.blockMuddleView.invalidate()
                    refreshHud()
                },
                onAdNotReady = {
                    Toast.makeText(this, getString(R.string.toast_no_ad_ready), Toast.LENGTH_SHORT).show()
                }
            )
        }

        dlgBinding.btnPlayAgain.setOnClickListener {
            soundAndHaptics.playPickup()
            dialog.dismiss()
            gameEngine.startNewGame()
            previousBestBeforeRun = gameEngine.highScore
            binding.blockMuddleView.animateTraySpawn()
            binding.blockMuddleView.invalidate()
            refreshHud()
        }

        gameOverDialog = dialog
        dialog.show()
    }

    override fun onPause() {
        super.onPause()
        gameEngine.saveState()
    }

    override fun onDestroy() {
        AdManager.removeAvailabilityListener(adAvailabilityListener)
        soundAndHaptics.release()
        pauseDialog?.dismiss()
        gameOverDialog?.dismiss()
        super.onDestroy()
    }
}
