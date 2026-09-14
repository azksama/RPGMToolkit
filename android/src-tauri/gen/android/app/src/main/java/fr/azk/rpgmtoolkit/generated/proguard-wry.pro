# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class fr.azk.rpgmtoolkit.* {
  native <methods>;
}

-keep class fr.azk.rpgmtoolkit.WryActivity {
  public <init>(...);

  void setWebView(fr.azk.rpgmtoolkit.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class fr.azk.rpgmtoolkit.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class fr.azk.rpgmtoolkit.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class fr.azk.rpgmtoolkit.RustWebChromeClient,fr.azk.rpgmtoolkit.RustWebViewClient {
  public <init>(...);
}
