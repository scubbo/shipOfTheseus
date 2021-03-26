$(document).ready(function() {
    $.get('/commits.json', function(data) {
        $('#commits').append('<ul id="commits-list">')
        $.each(JSON.parse(data), function(idx, commit) {
            $('#commits-list').append(
                '<li>' +
                  // 50 from https://chris.beams.io/posts/git-commit/
                  commit['sha'].slice(0, 6) + '\t' + commit['title'].slice(0, 50) +
                '</li>'
            );
        });
        $('#commits').append('</ul>');
    });
});