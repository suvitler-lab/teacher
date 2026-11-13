const m=require("C:/Users/User/Desktop/teacher/scripts/fixture-server.cjs");const orig=m.startFixtureServer;
m.startFixtureServer=(o={})=>orig({...o,lateAfter:"00:00"});
