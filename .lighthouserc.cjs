module.exports={
  ci:{
    collect:{staticDistDir:'.local/lighthouse-public',numberOfRuns:3,
      settings:{chromeFlags:'--no-sandbox --headless=new'}},
    assert:{assertions:{'categories:performance':['error',{minScore:0.9}],
      'categories:accessibility':['error',{minScore:0.9}]}},
    upload:{target:'filesystem',outputDir:'.local/lighthouse-results'},
  },
};
