#!/usr/bin/env python3
"""Install Bosley's native Android always-on-top floating bar into a generated Capacitor project."""
from pathlib import Path
import re

root = Path("android")
manifest = root / "app/src/main/AndroidManifest.xml"
if not manifest.exists():
    raise SystemExit("Generated AndroidManifest.xml not found")
text = manifest.read_text()
if "android.permission.RECORD_AUDIO" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <application', 1)
if "android.permission.CAMERA" not in text:
    text = text.replace("<application", '<uses-permission android:name="android.permission.CAMERA" />\n    <application', 1)
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
  int widgetWidth=110,widgetHeight=38,cornerDp=22,borderDp=1,eyeWidth=10,eyeHeight=20,eyeGapDp=12; String eyeShape="soft-square";
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
    for(int n=0;n<2;n++){View eye=new View(this);GradientDrawable e=new GradientDrawable();e.setColor(Color.WHITE);e.setCornerRadius(dp("soft-square".equals(eyeShape)?6:Math.max(1,eyeWidth)));eye.setBackground(e);LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(dp(eyeWidth),dp(eyeHeight));if(n==1)ep.leftMargin=dp(eyeGapDp);inner.addView(eye,ep);}
    frame.addView(inner,new LinearLayout.LayoutParams(-1,-2));bar=frame;
    lp=new WindowManager.LayoutParams(dp(widgetWidth),dp(widgetHeight),Build.VERSION.SDK_INT>=26?WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY:WindowManager.LayoutParams.TYPE_PHONE,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);
    lp.gravity=Gravity.TOP|Gravity.CENTER_HORIZONTAL;lp.y=dp(7);
    frame.setOnTouchListener(new View.OnTouchListener(){float sx,sy;int ox,oy;long down;boolean moved,longPressed;Handler gestureHandler=new Handler(Looper.getMainLooper());Runnable holdAction=()->{longPressed=true;openCompanion("voice");};
      public boolean onTouch(View v,android.view.MotionEvent e){switch(e.getAction()){
        case MotionEvent.ACTION_DOWN:sx=e.getRawX();sy=e.getRawY();ox=lp.x;oy=lp.y;down=System.currentTimeMillis();moved=false;longPressed=false;gestureHandler.postDelayed(holdAction,480);return true;
        case MotionEvent.ACTION_MOVE:if(Math.abs(e.getRawX()-sx)>12||Math.abs(e.getRawY()-sy)>12){moved=true;gestureHandler.removeCallbacks(holdAction);lp.x=ox+(int)(e.getRawX()-sx);lp.y=Math.max(0,oy+(int)(e.getRawY()-sy));try{wm.updateViewLayout(bar,lp);}catch(Exception ignored){}}return true;
        case MotionEvent.ACTION_UP:gestureHandler.removeCallbacks(holdAction);if(!moved&&!longPressed&&System.currentTimeMillis()-down<480)openCompanion("panel");return true;
        case MotionEvent.ACTION_CANCEL:gestureHandler.removeCallbacks(holdAction);return true;
      }return true;}});
    try{wm.addView(bar,lp);}catch(Exception e){bar=null;}
  }
  void openCompanion(String action){Intent a=new Intent(BosleyOverlayService.this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);a.putExtra("bosley_quick_action",action);startActivity(a);}
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
@CapacitorPlugin(name="BosleyOverlay", permissions={@Permission(alias="microphone", strings={android.Manifest.permission.RECORD_AUDIO})})
public class BosleyOverlayPlugin extends Plugin {
  private android.speech.tts.TextToSpeech bosleyTts;
  private boolean bosleyTtsReady=false;
  @PluginMethod public void speakText(PluginCall call){
    String text=call.getString("text","");
    String profile=call.getString("profile","jarvis");
    if(text==null||text.trim().isEmpty()){call.resolve();return;}
    if(text.length()>5000)text=text.substring(0,5000);
    final String utterance=text;
    try{
      if(bosleyTts==null){
        bosleyTts=new android.speech.tts.TextToSpeech(getContext(),status->{
          bosleyTtsReady=status==android.speech.tts.TextToSpeech.SUCCESS;
          if(bosleyTtsReady){
            int lang=bosleyTts.setLanguage(java.util.Locale.UK);
            if(lang==android.speech.tts.TextToSpeech.LANG_MISSING_DATA||lang==android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED)bosleyTts.setLanguage(java.util.Locale.getDefault());
            bosleyTts.setSpeechRate("jarvis".equals(profile)?0.9f:1.0f);
            bosleyTts.setPitch("jarvis".equals(profile)?0.78f:1.0f);
            bosleyTts.speak(utterance,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"bosley-"+System.currentTimeMillis());
          }
        });
        JSObject r=new JSObject();r.put("queued",true);call.resolve(r);return;
      }
      if(!bosleyTtsReady){JSObject r=new JSObject();r.put("queued",false);r.put("reason","Android speech engine is still starting");call.resolve(r);return;}
      bosleyTts.setSpeechRate("jarvis".equals(profile)?0.9f:1.0f);
      bosleyTts.setPitch("jarvis".equals(profile)?0.78f:1.0f);
      bosleyTts.speak(utterance,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"bosley-"+System.currentTimeMillis());
      JSObject r=new JSObject();r.put("queued",true);call.resolve(r);
    }catch(Exception e){call.reject("Android text-to-speech failed. Check that a text-to-speech engine is installed.",e);}
  }
  @PluginMethod public void stopSpeaking(PluginCall call){
    try{if(bosleyTts!=null)bosleyTts.stop();}catch(Exception ignored){}
    call.resolve();
  }
  @PluginMethod public void startNativeSpeechRecognition(PluginCall call){
    Intent speech=new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    speech.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
    speech.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE,java.util.Locale.getDefault().toLanguageTag());
    speech.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT,"Speak to Bosley");
    try{startActivityForResult(call,speech,"nativeSpeechRecognitionResult");}
    catch(Exception e){call.reject("Android speech recognition is unavailable. Enable a speech recognition service, then try again.",e);}
  }
  @ActivityCallback private void nativeSpeechRecognitionResult(PluginCall call,ActivityResult result){
    JSObject response=new JSObject();
    if(result.getResultCode()==android.app.Activity.RESULT_OK&&result.getData()!=null){
      java.util.ArrayList<String> matches=result.getData().getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
      response.put("text",matches!=null&&!matches.isEmpty()?matches.get(0):"");
    }else response.put("text","");
    call.resolve(response);
  }
  @PluginMethod public void requestMicrophonePermission(PluginCall call){
    if(getPermissionState("microphone")!=PermissionState.GRANTED){
      requestPermissionForAlias("microphone",call,"microphonePermissionCallback");return;
    }
    JSObject r=new JSObject();r.put("granted",true);call.resolve(r);
  }
  @PermissionCallback private void microphonePermissionCallback(PluginCall call){
    boolean granted=getPermissionState("microphone")==PermissionState.GRANTED;
    JSObject r=new JSObject();r.put("granted",granted);
    if(granted)call.resolve(r);else call.reject("Microphone permission was not granted. Allow microphone access in Android app settings.");
  }
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
    int w="compact".equals(size)?100:("wide".equals(size)?120:110),h="compact".equals(size)?36:("wide".equals(size)?42:38);int c="sharp".equals(edge)?18:("balanced".equals(edge)?20:22);int b="thin".equals(border)?1:("bold".equals(border)?3:2);int ew="compact".equals(faceSize)?9:("default".equals(faceSize)?10:12),eh="compact".equals(faceSize)?17:("default".equals(faceSize)?20:22);int gap="close".equals(eyeGap)?8:("wide".equals(eyeGap)?16:12);
    i.putExtra("widgetWidth",w);i.putExtra("widgetHeight",h);i.putExtra("cornerDp",c);i.putExtra("borderDp",b);i.putExtra("eyeWidth",ew);i.putExtra("eyeHeight",eh);i.putExtra("eyeGapDp",gap);i.putExtra("eyeShape",eyeShape);return i;
  }
  @PluginMethod public void hide(PluginCall call){Intent i=new Intent(getContext(),BosleyOverlayService.class);i.setAction(BosleyOverlayService.ACTION_HIDE);getContext().startService(i);JSObject r=new JSObject();r.put("visible",false);call.resolve(r);}
  @PluginMethod public void consumeLaunchAction(PluginCall call){
    String action=getActivity().getIntent().getStringExtra("bosley_quick_action");
    getActivity().getIntent().removeExtra("bosley_quick_action");
    JSObject r=new JSObject();r.put("action",action==null?"":action);call.resolve(r);
  }
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
