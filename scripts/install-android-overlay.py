#!/usr/bin/env python3
"""Install Bosley's native Android always-on-top floating bar into a generated Capacitor project."""
from pathlib import Path
import re

root = Path("android")
manifest = root / "app/src/main/AndroidManifest.xml"
if not manifest.exists():
    raise SystemExit("Generated AndroidManifest.xml not found")
text = manifest.read_text()
if "SYSTEM_ALERT_WINDOW" not in text:
    text = text.replace("<manifest ", '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1) if 'xmlns:tools=' not in text else text
    text = text.replace("<application", '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />\n    <application', 1)
if "BosleyOverlayService" not in text:
    text = text.replace("</application>", '        <service android:name=".BosleyOverlayService" android:exported="false" />\n    </application>')
manifest.write_text(text)

src = root / "app/src/main/java/com/bosley/companion"
src.mkdir(parents=True, exist_ok=True)
(src / "BosleyOverlayService.java").write_text(r'''package com.bosley.companion;
import android.app.*;
import android.content.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import android.graphics.PixelFormat;

public class BosleyOverlayService extends Service {
  static final String ACTION_SHOW="com.bosley.companion.SHOW_OVERLAY", ACTION_HIDE="com.bosley.companion.HIDE_OVERLAY";
  WindowManager wm; View bar; WindowManager.LayoutParams lp;
  @Override public void onCreate(){super.onCreate();wm=(WindowManager)getSystemService(WINDOW_SERVICE);}
  @Override public int onStartCommand(Intent i,int flags,int id){
    if(i!=null && ACTION_HIDE.equals(i.getAction())){removeBar();stopSelf();return START_NOT_STICKY;}
    if(!Settings.canDrawOverlays(this)){Intent p=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(p);return START_NOT_STICKY;}
    showBar();return START_STICKY;
  }
  void showBar(){if(bar!=null)return;
    LinearLayout frame=new LinearLayout(this);frame.setGravity(Gravity.CENTER);frame.setOrientation(LinearLayout.HORIZONTAL);
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(3,3,3));bg.setCornerRadius(dp(25));bg.setStroke(dp(2),Color.WHITE);frame.setBackground(bg);frame.setPadding(dp(3),dp(3),dp(3),dp(3));
    LinearLayout inner=new LinearLayout(this);inner.setGravity(Gravity.CENTER);inner.setOrientation(LinearLayout.HORIZONTAL);
    GradientDrawable edge=new GradientDrawable();edge.setColor(Color.TRANSPARENT);edge.setCornerRadius(dp(22));edge.setStroke(dp(1),0x66FFFFFF);inner.setBackground(edge);
    inner.setPadding(dp(23),dp(9),dp(23),dp(9));
    for(int n=0;n<2;n++){View eye=new View(this);GradientDrawable e=new GradientDrawable();e.setColor(Color.WHITE);e.setCornerRadius(dp(12));eye.setBackground(e);LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(dp(9),dp(24));if(n==1)ep.leftMargin=dp(16);inner.addView(eye,ep);}
    frame.addView(inner,new LinearLayout.LayoutParams(-1,-2));bar=frame;
    lp=new WindowManager.LayoutParams(dp(150),dp(46),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    lp.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;lp.y=dp(0);
    frame.setOnTouchListener(new View.OnTouchListener(){float sx,sy;int ox,oy;long down;
      public boolean onTouch(View v,android.view.MotionEvent e){switch(e.getAction()){case MotionEvent.ACTION_DOWN:sx=e.getRawX();sy=e.getRawY();ox=lp.x;oy=lp.y;down=System.currentTimeMillis();return true;case MotionEvent.ACTION_MOVE:lp.x=ox+(int)(e.getRawX()-sx);lp.y=Math.max(0,oy+(int)(e.getRawY()-sy));try{wm.updateViewLayout(bar,lp);}catch(Exception ignored){}return true;case MotionEvent.ACTION_UP:if(Math.abs(e.getRawX()-sx)<12&&Math.abs(e.getRawY()-sy)<12){Intent a=new Intent(BosleyOverlayService.this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(a);}return true;}return true;}});
    try{wm.addView(bar,lp);}catch(Exception e){bar=null;}
  }
  void removeBar(){if(wm!=null&&bar!=null){try{wm.removeView(bar);}catch(Exception ignored){}bar=null;}}
  int dp(float v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
  @Override public void onDestroy(){removeBar();super.onDestroy();}
  @Override public android.os.IBinder onBind(Intent i){return null;}
}''')
(src / "BosleyOverlayPlugin.java").write_text(r'''package com.bosley.companion;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
@CapacitorPlugin(name="BosleyOverlay")
public class BosleyOverlayPlugin extends Plugin {
  @PluginMethod public void requestPermission(PluginCall call){
    if(Build.VERSION.SDK_INT>=23&&!Settings.canDrawOverlays(getContext())){
      Intent i=new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:"+getContext().getPackageName()));
      startActivityForResult(call,i,"overlayPermissionResult");return;
    }
    JSObject r=new JSObject();r.put("granted",true);call.resolve(r);
  }
  @ActivityCallback private void overlayPermissionResult(PluginCall call,ActivityResult result){
    JSObject r=new JSObject();r.put("granted",Build.VERSION.SDK_INT<23||Settings.canDrawOverlays(getContext()));call.resolve(r);
  }
  @PluginMethod public void show(PluginCall call){
    if(Build.VERSION.SDK_INT>=23&&!Settings.canDrawOverlays(getContext())){call.reject("Overlay permission is required. Tap Enable floating widget and allow display over other apps.");return;}
    Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_SHOW);
    if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(i);else getContext().startService(i);
    JSObject r=new JSObject();r.put("visible",true);call.resolve(r);
  }
  @PluginMethod public void hide(PluginCall call){Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_HIDE);getContext().startService(i);JSObject r=new JSObject();r.put("visible",false);call.resolve(r);}
  @PluginMethod public void status(PluginCall call){JSObject r=new JSObject();r.put("available",true);r.put("granted",Build.VERSION.SDK_INT<23||Settings.canDrawOverlays(getContext()));call.resolve(r);}
}''')
activity = src / "MainActivity.java"
if not activity.exists():
    raise SystemExit("Generated MainActivity.java not found at expected Capacitor package path")
a=activity.read_text()
if "BosleyOverlayPlugin" not in a:
    a=a.replace("import com.getcapacitor.BridgeActivity;", "import com.getcapacitor.BridgeActivity;\nimport com.getcapacitor.Plugin;\nimport java.util.ArrayList;\nimport java.util.List;")
    a=re.sub(r'public class MainActivity extends BridgeActivity \{\s*\}', 'public class MainActivity extends BridgeActivity {\n  @Override public void onCreate(android.os.Bundle savedInstanceState) {\n    registerPlugin(BosleyOverlayPlugin.class);\n    super.onCreate(savedInstanceState);\n  }\n}', a)
    if "registerPlugin(BosleyOverlayPlugin.class)" not in a:
        raise SystemExit("Could not safely register native overlay plugin in MainActivity")
activity.write_text(a)
print("Installed native rounded floating widget service and Capacitor bridge.")
