"use strict";

const express = require("express");
const cors = require('cors');
const _ = require('lodash');
const fs = require("fs");
const fm = require("front-matter");
const JSONAPISerializer = require('jsonapi-serializer').Serializer;

const PostsSerializer = new JSONAPISerializer('posts', {
  attributes: [ 'title', 'slug', 'lang', 'summary', 'createdAt' ]
});
const PostSerializer = new JSONAPISerializer('posts', {
  attributes: [ 'title', 'slug', 'lang', 'summary', 'body' , 'createdAt']
});
const TagSerializer = new JSONAPISerializer('tags', {
  attributes: ['name', 'slug', 'lang', 'post-count']
});

const dirPath = `${__dirname}/${process.argv[2]}`;

const app = express();

const DEFAULT_LANG = "en";
let lang = undefined;
let posts = [];
let tags = [];

let getPostTags = (rawTags, lang = DEFAULT_LANG) => {
  let postTags = [] 
  let rawTagList = rawTags.split(",");

  rawTagList.forEach((rawTag, index) => {

    let postTag = tags.find((tag) => {
      return (tag.slug === rawTag.trim() && tag.lang == lang);
    });

    if(postTag) {
      postTag["post-count"] += 1;
      postTags.push(postTag);
    } else {
      let postTag = {};
      //console.dir(tags);
      postTag.id = tags.length;
      postTag.slug = rawTag.trim();
      postTag.lang = lang;
      postTag["post-count"] = 1;
      //TODO: check slug formatting - create test with wrong slug format
      postTag.name = rawTag.trim()
                           .replace(/-/g, " ")
                           .replace(/\b\w/g, (match) => { 
                              return match.toUpperCase(); 
                            });
      tags.push(postTag);
      postTags.push(postTag);
    }
  })
  return postTags;
}

fs.readdir(dirPath, (err, files) => {
  if (err) throw err;
  
  files.forEach((file, index) => {
    fs.readFile(`${dirPath}/${file}`, "utf8", (err, data) => {
      if (err) throw err;

      let post = {}
      let tag = {}
      const content = fm(data)

      // extract creation date and slug from the filename
      // TODO: return an error and crash if file pattern
      // doesn't match
      // TODO: refactor if seperate function
      let matched = file.match(/(\d{4}-\d{2}-\d{2})-(.*)\.md/); // 2017-03-02-some-post-slug.md

      let matchedDate = matched[1];
      let [ year, month, day ] = matchedDate.split("-"); // 2017-03-02
      post.createdAt = new Date(year, (month - 1), day).toISOString(); // months start from 0

      let matchedSlug = matched[2];
      post.slug = `${matchedDate.replace(/-/g, "/")}/${matchedSlug}`; // 2017/03/02/some-post-slug

      post.id = index + 1;
      post = Object.assign(post, content.attributes);
      post.body = content.body;

      // TODO: test that tags are properly formatted
      post.rawTags = post.tags.replace(/ /g, ""); //remove white spaces from tags string

      // get tags objects for the post
      post.tags = getPostTags(post.tags, post.lang);

      posts.push(post);
    });
  })
});

app.use(cors());

app.use((req, res, next) => {
  lang = req.get("X-Accept-Language") || DEFAULT_LANG;
  next();
});

const getMetaOnly = () => {
  const postsCount = posts.filter((post) => {
    return post.lang === lang;
  }).length;
  const tagsCount = tags.filter((tag) => {
    return tag.lang === lang;
  }).length;

  return {
           "meta": {
             "postsCount": postsCount,
             "tagsCount": tagsCount
           },
           "jsonapi": {
             "version":"1.0"
           },
           "data":[]
         };
}

const filterByLang = (item) => { return item.lang == lang; }

app.get('/api/posts/:id', (req, res) => {
  let post = posts.find( (post) => {
    return parseInt(post.id) === parseInt(req.params.id);
  });
  post ? res.json(PostSerializer.serialize(post)) : res.send("NOT FOUND");
});


app.get('/api/posts', (req, res) => {
  if (req.query.metaOnly == "true") {
    res.json(getMetaOnly());
  } 
  else {

    // GET /posts?filter[slug]=some-post-slug
    // NB: slugs must be unique
    if (_.has(req, 'query.filter.slug')) {
      let slug = _.get(req, 'query.filter.slug');
      let post = posts.find((post) => { 
        return post.slug === slug;
      });
      if (post) { res.json(PostSerializer.serialize(post)); } 
      else { res.send("Not Found"); }
    } 

    // GET /posts?filter[tag]=some-tag-slug
    else if (_.has(req, 'query.filter.tag')) {
      let tagSlug = _.get(req, 'query.filter.tag');
      let filteredPosts = posts.filter((post) => { 
        const hasTag = ( post.rawTags.split(",").indexOf(tagSlug) !== -1 );
        return hasTag && post.lang === lang;
      });
      if (filteredPosts) { res.json(PostsSerializer.serialize(filteredPosts)); } 
      else { res.send("Not Found"); }
    }

    // GET /posts
    else {
      res.json(PostsSerializer.serialize( posts.filter( filterByLang ) ));
    }
  }
});

app.get('/api/tags', (req, res) => {

    // GET /tags?filter[slug]=some-slug
    if(_.has(req, 'query.filter.slug')) {
      const tag = tags.find((tag) => {
        const slug = _.get(req, 'query.filter.slug');
        return tag.slug === slug && tag.lang === lang;
      });
      if (tag) { res.json(TagSerializer.serialize(tag)); }
      else { res.send("Not Found"); }
    }
    else {
      // GET /tags
      res.json(TagSerializer.serialize( tags.filter( filterByLang ) ));  
    }
});

app.listen(3000);
