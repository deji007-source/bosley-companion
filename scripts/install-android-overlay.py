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
  static final String ACTION_SHOW="com.bosley.companion.SHOW_OVERLAY", ACTION_HIDE="com.bosley.companion.HIDE_OVERLAY", ACTION_STYLE="com.bosley.companion.STYLE_OVERLAY";
  int widgetWidth=120,widgetHeight=72,cornerDp=24,borderDp=2,eyeWidth=29,eyeHeight=42,eyeGapDp=15; String eyeShape="pill";
  WindowManager wm; View bar; WindowManager.LayoutParams lp;
  @Override public void onCreate(){super.onCreate();wm=(WindowManager)getSystemService(WINDOW_SERVICE);}
  @Override public int onStartCommand(Intent i,int flags,int id){
    if(i!=null && ACTION_HIDE.equals(i.getAction())){removeBar();stopSelf();return START_NOT_STICKY;}
    if(i!=null){widgetWidth=i.getIntExtra("widgetWidth",widgetWidth);widgetHeight=i.getIntExtra("widgetHeight",widgetHeight);cornerDp=i.getIntExtra("cornerDp",cornerDp);borderDp=i.getIntExtra("borderDp",borderDp);eyeWidth=i.getIntExtra("eyeWidth",eyeWidth);eyeHeight=i.getIntExtra("eyeHeight",eyeHeight);eyeGapDp=i.getIntExtra("eyeGapDp",eyeGapDp);eyeShape=i.getStringExtra("eyeShape")!=null?i.getStringExtra("eyeShape"):eyeShape;}
    if(ACTION_STYLE.equals(i==null?null:i.getAction())){removeBar();}
    if(!Settings.canDrawOverlays(this)){Intent p=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(p);return START_NOT_STICKY;}
    showBar();return START_STICKY;
  }
  void showBar(){if(bar!=null)return;
    LinearLayout frame=new LinearLayout(this);frame.setGravity(Gravity.CENTER);frame.setOrientation(LinearLayout.HORIZONTAL);
    GradientDrawable bg=new GradientDrawable();bg.setColor(Color.rgb(3,3,3));bg.setCornerRadius(dp(cornerDp));bg.setStroke(dp(borderDp),Color.WHITE);frame.setBackground(bg);frame.setPadding(dp(3),dp(3),dp(3),dp(3));
    LinearLayout inner=new LinearLayout(this);inner.setGravity(Gravity.CENTER);inner.setOrientation(LinearLayout.HORIZONTAL);
    GradientDrawable edge=new GradientDrawable();edge.setColor(Color.TRANSPARENT);edge.setCornerRadius(dp(Math.max(1,cornerDp-borderDp)));edge.setStroke(dp(1),0x66FFFFFF);inner.setBackground(edge);
    inner.setPadding(dp(3),dp(3),dp(3),dp(3));
    for(int n=0;n<2;n++){View eye=new View(this);GradientDrawable e=new GradientDrawable();e.setColor(Color.WHITE);e.setCornerRadius(dp("soft-square".equals(eyeShape)?4:Math.max(1,eyeWidth)));eye.setBackground(e);LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(dp(eyeWidth),dp(eyeHeight));if(n==1)ep.leftMargin=dp(eyeGapDp);inner.addView(eye,ep);}
    frame.addView(inner,new LinearLayout.LayoutParams(-1,-2));bar=frame;
    lp=new WindowManager.LayoutParams(dp(widgetWidth),dp(widgetHeight),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
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
import androidx.activity.result.ActivityResult;
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
    Intent i=styledIntent(call,BosleyOverlayService.ACTION_SHOW);
    getContext().startService(i);
    JSObject r=new JSObject();r.put("visible",true);call.resolve(r);
  }
  @PluginMethod public void setAppearance(PluginCall call){
    Intent i=styledIntent(call,BosleyOverlayService.ACTION_STYLE);getContext().startService(i);JSObject r=new JSObject();r.put("ok",true);call.resolve(r);
  }
  private Intent styledIntent(PluginCall call,String action){
    Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(action);
    JSObject p=call.getObject("payload",new JSObject());String size=p.getString("widgetSize","default"),edge=p.getString("widgetEdge","soft"),border=p.getString("widgetBorder","medium"),eyeShape=p.getString("eyeShape","pill"),eyeGap=p.getString("eyeGap","normal"),faceSize=p.getString("size","default");
    int w="compact".equals(size)?108:("wide".equals(size)?136:120),h="compact".equals(size)?68:("wide".equals(size)?80:72);int c="sharp".equals(edge)?2:("balanced".equals(edge)?18:24);int b="thin".equals(border)?1:("bold".equals(border)?3:2);int ew="compact".equals(faceSize)?15:("default".equals(faceSize)?25:29),eh="compact".equals(faceSize)?24:("default".equals(faceSize)?36:42);int gap="close".equals(eyeGap)?9:("wide".equals(eyeGap)?21:15);
    i.putExtra("widgetWidth",w);i.putExtra("widgetHeight",h);i.putExtra("cornerDp",c);i.putExtra("borderDp",b);i.putExtra("eyeWidth",ew);i.putExtra("eyeHeight",eh);i.putExtra("eyeGapDp",gap);i.putExtra("eyeShape",eyeShape);return i;
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
