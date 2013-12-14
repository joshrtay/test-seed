#!/bin/bash

git checkout --force -B deploy
git merge master
rm -f .gitignore
grunt build
git add -A
git commit -am "deploying"
git push -f heroku master
git checkout master
git branch -D deploy