﻿using System;
using System.Windows.Forms;

namespace ExtraQL
{
  static class Program
  {
    public const string PostUpdateSwitch = "-postupdate";
    public const string WinServiceSwitch = "-service";

    #region Main()
    [STAThread]
    static void Main()
    {
      AppDomain.CurrentDomain.UnhandledException += (sender, args) => HandleException(args.ExceptionObject as Exception);
      Application.ThreadException += (sender, args) => HandleException(args.Exception);

      try
      {
        bool isPostUpdate = Environment.CommandLine == PostUpdateSwitch;

        Config config = new Config();
        config.LoadSettings();
        if (!isPostUpdate && ActivateRunningInstance(config.GetBool("https"))) 
          return;

        Application.EnableVisualStyles();

        var updater = new Updater(config);
        if (!isPostUpdate)
          updater.Run();

        var mainForm = new MainForm(config, updater);
        if (Environment.CommandLine.Contains(WinServiceSwitch))
          WinService.Start(mainForm);
        else
          Application.Run(mainForm);
      }
      catch (Exception ex)
      {
        HandleException(ex);
      }
    }
    #endregion

    #region ActivateRunningInstance()
    private static bool ActivateRunningInstance(bool useHttps)
    {
      using (var client = new XWebClient(500))
      {
        try
        {
          var result = client.DownloadString((useHttps ? "https" : "http") + "://127.0.0.1:27963/bringToFront");
          if (result == "ok")
            return true;
        }
        catch
        {
        }
      }
      return false;
    }
    #endregion

    #region HandleException()
    private static void HandleException(Exception ex)
    {
      MessageBox.Show(ex.ToString(), "Program failure", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
    #endregion
  }
}
