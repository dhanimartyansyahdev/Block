package com.blockmuddle.game

import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.min
import kotlin.math.pow

object AdManager {

    const val REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917"

    private const val BASE_RETRY_DELAY_MS = 2_000L
    private const val MAX_RETRY_DELAY_MS = 64_000L

    private var rewardedAd: RewardedAd? = null
    private var isLoading = false
    private var isInitialized = false
    private var retryAttempt = 0
    private var appContext: Context? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val availabilityListeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

    private val retryRunnable = Runnable {
        appContext?.let { preloadRewardedAd(it) }
    }

    fun initialize(context: Context) {
        val applicationContext = context.applicationContext
        appContext = applicationContext

        if (isInitialized) {
            if (!isAdReady() && !isLoading) {
                preloadRewardedAd(applicationContext)
            }
            return
        }

        isInitialized = true
        MobileAds.initialize(applicationContext) {
            preloadRewardedAd(applicationContext)
        }
    }

    fun addAvailabilityListener(listener: (Boolean) -> Unit) {
        availabilityListeners.addIfAbsent(listener)
        listener(isAdReady())
    }

    fun removeAvailabilityListener(listener: (Boolean) -> Unit) {
        availabilityListeners.remove(listener)
    }

    fun isAdReady(): Boolean = rewardedAd != null

    fun isNetworkAvailable(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    fun preloadRewardedAd(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        if (isLoading || rewardedAd != null) return

        if (!isNetworkAvailable(ctx)) {
            scheduleRetryWithBackoff()
            notifyListeners(false)
            return
        }

        isLoading = true
        mainHandler.removeCallbacks(retryRunnable)

        val adRequest = AdRequest.Builder().build()
        RewardedAd.load(
            ctx,
            REWARDED_AD_UNIT_ID,
            adRequest,
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    isLoading = false
                    retryAttempt = 0
                    rewardedAd = ad
                    notifyListeners(true)
                }

                override fun onAdFailedToLoad(loadAdError: LoadAdError) {
                    isLoading = false
                    rewardedAd = null
                    notifyListeners(false)
                    scheduleRetryWithBackoff()
                }
            }
        )
    }

    fun showRewardedAd(
        activity: Activity,
        onRewardEarned: () -> Unit,
        onAdNotReady: () -> Unit,
        onAdClosed: () -> Unit = {}
    ) {
        val ad = rewardedAd
        if (ad == null || !isNetworkAvailable(activity)) {
            onAdNotReady()
            preloadRewardedAd(activity)
            return
        }

        var rewardGranted = false
        rewardedAd = null
        notifyListeners(false)

        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                if (rewardGranted) {
                    onRewardEarned()
                }
                onAdClosed()
                preloadRewardedAd(activity)
            }

            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                onAdNotReady()
                onAdClosed()
                preloadRewardedAd(activity)
            }

            override fun onAdShowedFullScreenContent() {
                // Ad is now presenting full screen
            }
        }

        ad.show(activity) {
            rewardGranted = true
        }
    }

    private fun scheduleRetryWithBackoff() {
        mainHandler.removeCallbacks(retryRunnable)
        val exponent = min(retryAttempt, 5)
        val delayMs = min(
            MAX_RETRY_DELAY_MS,
            (BASE_RETRY_DELAY_MS * 2.0.pow(exponent.toDouble())).toLong()
        )
        retryAttempt++
        mainHandler.postDelayed(retryRunnable, delayMs)
    }

    private fun notifyListeners(ready: Boolean) {
        mainHandler.post {
            availabilityListeners.forEach { listener ->
                listener.invoke(ready)
            }
        }
    }
}
