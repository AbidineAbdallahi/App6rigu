package mr.deliver.app

import android.app.Application
import android.content.res.Configuration
import androidx.annotation.NonNull

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint
import expo.modules.ExpoModulesPackage
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage
import com.th3rdwave.safeareacontext.SafeAreaContextPackage
import com.swmansion.rnscreens.RNScreensPackage
import com.rnmaps.maps.MapsPackage
import com.oney.WebRTCModule.WebRTCModulePackage
import com.reactnativecommunity.webview.RNCWebViewPackage
import io.invertase.notifee.NotifeePackage
import io.invertase.firebase.app.ReactNativeFirebaseAppPackage
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages.toMutableList()
            packages.add(ExpoModulesPackage())
            packages.add(AsyncStoragePackage())
            packages.add(SafeAreaContextPackage())
            packages.add(RNScreensPackage())
            packages.add(MapsPackage())
            packages.add(WebRTCModulePackage())
            packages.add(RNCWebViewPackage())
            packages.add(NotifeePackage())
            packages.add(ReactNativeFirebaseAppPackage())
            packages.add(ReactNativeFirebaseMessagingPackage())
            return packages
          }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getBundleAssetName(): String = "index.android.bundle"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    ReactNativeApplicationEntryPoint.loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
